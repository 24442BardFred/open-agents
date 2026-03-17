import {
  convertToModelMessages,
  type FinishReason,
  generateId as generateIdAi,
  isToolUIPart,
  type LanguageModelUsage,
  type ModelMessage,
  type UIMessageChunk,
} from "ai";
import {
  addLanguageModelUsage,
  collectTaskToolUsageEvents,
  sumLanguageModelUsage,
} from "@open-harness/agent";
import type { OpenHarnessAgentCallOptions } from "@open-harness/agent";
import { getWorkflowMetadata, getWritable } from "workflow";
import { getRun } from "workflow/api";
import { webAgent } from "@/app/config";
import type { WebAgentUIMessage, WebAgentMessageMetadata } from "@/app/types";
import {
  compareAndSetChatActiveStreamId,
  createChatMessageIfNotExists,
  touchChat,
  updateChat,
  isFirstChatMessage,
  upsertChatMessageScoped,
  updateChatAssistantActivity,
} from "@/lib/db/sessions";
import { recordUsage } from "@/lib/db/usage";

type Options = {
  messages: WebAgentUIMessage[];
  chatId: string;
  userId: string;
  modelId: string;
  agentOptions: OpenHarnessAgentCallOptions;
  maxSteps?: number;
};

type Writable = WritableStream<UIMessageChunk>;

const cachedInputTokensFor = (usage: LanguageModelUsage) =>
  usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;

const shouldPauseForToolInteraction = (parts: WebAgentUIMessage["parts"]) =>
  parts.some(
    (part) =>
      isToolUIPart(part) &&
      (part.state === "input-available" || part.state === "approval-requested"),
  );

const convertMessages = async (
  messages: WebAgentUIMessage[],
): Promise<ModelMessage[]> => {
  "use step";
  return await convertToModelMessages(messages, {
    ignoreIncompleteToolCalls: true,
    tools: webAgent.tools,
  });
};

const generateId = async () => {
  "use step";
  return generateIdAi();
};

async function persistUserMessage(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  "use step";

  if (message.role !== "user") {
    return;
  }

  try {
    const created = await createChatMessageIfNotExists({
      id: message.id,
      chatId,
      role: "user",
      parts: message,
    });

    if (!created) {
      return;
    }

    await touchChat(chatId);

    const shouldSetTitle = await isFirstChatMessage(chatId, created.id);
    if (!shouldSetTitle) {
      return;
    }

    const textContent = message.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join(" ")
      .trim();

    if (textContent.length === 0) {
      return;
    }

    const title =
      textContent.length > 30 ? `${textContent.slice(0, 30)}...` : textContent;
    await updateChat(chatId, { title });
  } catch (error) {
    console.error("[workflow] Failed to persist user message:", error);
  }
}

async function persistAssistantMessage(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  "use step";

  try {
    const result = await upsertChatMessageScoped({
      id: message.id,
      chatId,
      role: "assistant",
      parts: message,
    });

    if (result.status === "conflict") {
      console.warn(
        `[workflow] Skipped assistant upsert due to ID scope conflict: ${message.id}`,
      );
    } else if (result.status === "inserted") {
      await updateChatAssistantActivity(chatId, new Date());
    }
  } catch (error) {
    console.error("[workflow] Failed to persist assistant message:", error);
  }
}

async function clearActiveStream(
  chatId: string,
  workflowRunId: string,
): Promise<void> {
  "use step";
  try {
    // Only clear if this workflow's run ID is still the active one.
    // Prevents a late-finishing workflow from clearing a newer workflow's ID.
    await compareAndSetChatActiveStreamId(chatId, workflowRunId, null);
  } catch (error) {
    console.error("[workflow] Failed to clear activeStreamId:", error);
  }
}

async function recordWorkflowUsage(
  userId: string,
  modelId: string,
  totalUsage: LanguageModelUsage | undefined,
  responseMessage: WebAgentUIMessage,
): Promise<void> {
  "use step";

  try {
    // Record main agent usage
    if (totalUsage) {
      await recordUsage(userId, {
        source: "web",
        agentType: "main",
        model: modelId,
        messages: [responseMessage],
        usage: {
          inputTokens: totalUsage.inputTokens ?? 0,
          cachedInputTokens: cachedInputTokensFor(totalUsage),
          outputTokens: totalUsage.outputTokens ?? 0,
        },
      });
    }

    // Record subagent usage (aggregated by model)
    const subagentUsageEvents = collectTaskToolUsageEvents(responseMessage);
    if (subagentUsageEvents.length > 0) {
      const subagentUsageByModel = new Map<string, LanguageModelUsage>();
      for (const event of subagentUsageEvents) {
        const eventModelId = event.modelId ?? modelId;
        if (!eventModelId) {
          continue;
        }

        const existing = subagentUsageByModel.get(eventModelId);
        const combined = sumLanguageModelUsage(existing, event.usage);
        if (combined) {
          subagentUsageByModel.set(eventModelId, combined);
        }
      }

      for (const [eventModelId, usage] of subagentUsageByModel) {
        await recordUsage(userId, {
          source: "web",
          agentType: "subagent",
          model: eventModelId,
          messages: [],
          usage: {
            inputTokens: usage.inputTokens ?? 0,
            cachedInputTokens: cachedInputTokensFor(usage),
            outputTokens: usage.outputTokens ?? 0,
          },
        });
      }
    }
  } catch (error) {
    console.error("[workflow] Failed to record usage:", error);
  }
}

export async function runAgentWorkflow(options: Options) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();

  const latestMessage = options.messages.at(-1);

  if (latestMessage == null) {
    throw new Error("runAgentWorkflow requires at least one message");
  }

  const [, modelMessages, assistantId] = await Promise.all([
    persistUserMessage(options.chatId, latestMessage),
    convertMessages(options.messages),
    latestMessage.role === "assistant"
      ? Promise.resolve(latestMessage.id)
      : generateId(),
  ]);

  let pendingAssistantResponse: WebAgentUIMessage =
    latestMessage.role === "assistant"
      ? {
          ...latestMessage,
          metadata: latestMessage.metadata ?? ({} as WebAgentMessageMetadata),
          parts: [...latestMessage.parts],
        }
      : {
          role: "assistant",
          id: assistantId,
          parts: [],
          metadata: {} as WebAgentMessageMetadata,
        };

  let originalMessagesForStep: WebAgentUIMessage[] = [latestMessage];

  await sendStart(writable, assistantId);

  let wasAborted = false;
  let totalUsage: LanguageModelUsage | undefined;

  for (
    let step = 0;
    options.maxSteps === undefined || step < options.maxSteps;
    step++
  ) {
    const result = await runAgentStep(
      modelMessages,
      originalMessagesForStep,
      assistantId,
      writable,
      workflowRunId,
      options.agentOptions,
    );

    pendingAssistantResponse =
      result.responseMessage ?? pendingAssistantResponse;
    originalMessagesForStep = [pendingAssistantResponse];
    modelMessages.push(...result.responseMessages);
    wasAborted = wasAborted || result.stepWasAborted;

    if (result.stepUsage) {
      totalUsage = totalUsage
        ? addLanguageModelUsage(totalUsage, result.stepUsage)
        : result.stepUsage;
    }

    if (
      result.finishReason !== "tool-calls" ||
      shouldPauseForToolInteraction(
        result.responseMessage?.parts ?? pendingAssistantResponse.parts,
      )
    ) {
      break;
    }
  }

  if (!wasAborted) {
    await persistAssistantMessage(options.chatId, pendingAssistantResponse);
  }

  await recordWorkflowUsage(
    options.userId,
    options.modelId,
    totalUsage,
    pendingAssistantResponse,
  );

  await clearActiveStream(options.chatId, workflowRunId);
  await sendFinish(writable);
  await closeStream(writable);
}

const runAgentStep = async (
  messages: ModelMessage[],
  originalMessages: WebAgentUIMessage[],
  messageId: string,
  writable: Writable,
  workflowRunId: string,
  agentOptions: OpenHarnessAgentCallOptions,
) => {
  "use step";

  const abortController = new AbortController();
  const stopMonitor = startStopMonitor(workflowRunId, abortController);

  try {
    let responseMessage: WebAgentUIMessage | undefined;
    let lastStepUsage: LanguageModelUsage | undefined;

    const result = await webAgent.stream({
      messages,
      options: agentOptions,
      abortSignal: abortController.signal,
    });

    for await (const part of result.toUIMessageStream<WebAgentUIMessage>({
      originalMessages,
      generateMessageId: () => messageId,
      sendStart: false,
      sendFinish: false,
      messageMetadata: ({ part: streamPart }) => {
        if (streamPart.type === "finish-step") {
          lastStepUsage = streamPart.usage;
          return {
            lastStepUsage,
            totalMessageUsage: undefined,
          } satisfies WebAgentMessageMetadata;
        }
        return undefined;
      },
      onFinish: ({ responseMessage: finishedResponseMessage }) => {
        responseMessage = finishedResponseMessage;
      },
    })) {
      const writer = writable.getWriter();
      await writer.write(part);
      writer.releaseLock();
    }

    if (responseMessage == null) {
      throw new Error("Agent stream finished without a response message");
    }

    const stepUsage = await result.totalUsage;

    return {
      responseMessage,
      responseMessages: (await result.response).messages,
      finishReason: await result.finishReason,
      stepUsage,
      stepWasAborted: false,
    };
  } catch (error) {
    if (isAbortError(error)) {
      const abortedFinishReason: FinishReason = "stop";
      return {
        responseMessage: undefined,
        responseMessages: [],
        finishReason: abortedFinishReason,
        stepUsage: undefined,
        stepWasAborted: true,
      };
    }

    throw error;
  } finally {
    stopMonitor.stop();
    await stopMonitor.done;
  }
};

function startStopMonitor(runId: string, abortController: AbortController) {
  let shouldStop = false;

  const done = (async () => {
    const run = getRun(runId);

    while (!shouldStop && !abortController.signal.aborted) {
      let runStatus:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled";

      try {
        runStatus = await run.status;
      } catch {
        await delay(150);
        continue;
      }

      if (runStatus === "cancelled") {
        abortController.abort();
        return;
      }

      await delay(150);
    }
  })();

  return {
    stop() {
      shouldStop = true;
    },
    done,
  };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function sendStart(writable: Writable, messageId: string) {
  "use step";
  const writer = writable.getWriter();
  try {
    await writer.write({ type: "start", messageId });
  } finally {
    writer.releaseLock();
  }
}

async function sendFinish(writable: Writable) {
  "use step";
  const writer = writable.getWriter();
  try {
    await writer.write({ type: "finish", finishReason: "stop" });
  } finally {
    writer.releaseLock();
  }
}

async function closeStream(writable: Writable) {
  "use step";
  await writable.close();
}
