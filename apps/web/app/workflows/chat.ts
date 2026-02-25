import {
  readUIMessageStream,
  type FinishReason,
  type LanguageModelUsage,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getWritable } from "workflow";

const MAX_CHAT_WORKFLOW_ITERATIONS = 100;

export interface DurableAgentCallOptions {
  sandboxConfig: unknown;
  approval: unknown;
  modelConfig?: unknown;
  subagentModelConfig?: unknown;
  customInstructions?: string;
  executionMode?: "normal" | "durable";
  skills?: unknown[];
}

export interface ChatWorkflowResult {
  responseMessage: UIMessage | null;
  totalMessageUsage?: LanguageModelUsage;
}

export async function runDurableChatWorkflow(
  messages: ModelMessage[],
  options: DurableAgentCallOptions,
): Promise<ChatWorkflowResult> {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();
  let modelMessages = messages;
  let responseMessage: UIMessage | null = null;
  let totalMessageUsage: LanguageModelUsage | undefined;

  for (let index = 0; index < MAX_CHAT_WORKFLOW_ITERATIONS; index += 1) {
    const stepResult = await runChatStep(modelMessages, writable, options);
    modelMessages = [...modelMessages, ...stepResult.responseMessages];

    if (stepResult.responseMessage) {
      responseMessage = stepResult.responseMessage;
    }

    totalMessageUsage = addLanguageModelUsage(
      totalMessageUsage,
      stepResult.totalMessageUsage,
    );

    if (stepResult.finishReason !== "tool-calls") {
      break;
    }
  }

  await closeStream(writable);

  return {
    responseMessage,
    totalMessageUsage,
  };
}

function addLanguageModelUsage(
  first: LanguageModelUsage | undefined,
  second: LanguageModelUsage | undefined,
): LanguageModelUsage | undefined {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return {
    inputTokens: (first.inputTokens ?? 0) + (second.inputTokens ?? 0),
    outputTokens: (first.outputTokens ?? 0) + (second.outputTokens ?? 0),
    totalTokens: (first.totalTokens ?? 0) + (second.totalTokens ?? 0),
    reasoningTokens:
      (first.reasoningTokens ?? 0) + (second.reasoningTokens ?? 0),
    cachedInputTokens:
      (first.cachedInputTokens ?? 0) + (second.cachedInputTokens ?? 0),
    inputTokenDetails: {
      noCacheTokens:
        (first.inputTokenDetails?.noCacheTokens ?? 0) +
        (second.inputTokenDetails?.noCacheTokens ?? 0),
      cacheReadTokens:
        (first.inputTokenDetails?.cacheReadTokens ?? 0) +
        (second.inputTokenDetails?.cacheReadTokens ?? 0),
      cacheWriteTokens:
        (first.inputTokenDetails?.cacheWriteTokens ?? 0) +
        (second.inputTokenDetails?.cacheWriteTokens ?? 0),
    },
    outputTokenDetails: {
      textTokens:
        (first.outputTokenDetails?.textTokens ?? 0) +
        (second.outputTokenDetails?.textTokens ?? 0),
      reasoningTokens:
        (first.outputTokenDetails?.reasoningTokens ?? 0) +
        (second.outputTokenDetails?.reasoningTokens ?? 0),
    },
  };
}

async function runChatStep(
  messages: ModelMessage[],
  writable: WritableStream<UIMessageChunk>,
  callOptions: DurableAgentCallOptions,
) {
  "use step";

  const { webAgent } = await import("@/app/config");

  let lastStepUsage: LanguageModelUsage | undefined;
  let totalMessageUsage: LanguageModelUsage | undefined;

  const result = await webAgent.stream({
    messages,
    options: {
      ...callOptions,
      executionMode: "durable",
    } as never,
  });

  const uiMessageStream = result.toUIMessageStream<UIMessage>({
    messageMetadata: ({ part }) => {
      if (part.type === "finish-step") {
        lastStepUsage = part.usage;
        return { lastStepUsage, totalMessageUsage: undefined };
      }

      if (part.type === "finish") {
        totalMessageUsage = part.totalUsage;
        return { lastStepUsage, totalMessageUsage: part.totalUsage };
      }

      return undefined;
    },
  });

  const [streamForWritable, streamForMessage] = uiMessageStream.tee();
  const reader = streamForWritable.getReader();
  const writer = writable.getWriter();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      await writer.write(value);
    }
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }

  let responseMessage: UIMessage | null = null;
  for await (const message of readUIMessageStream<UIMessage>({
    stream: streamForMessage,
  })) {
    responseMessage = message;
  }

  const response = await result.response;
  const finishReason = (await result.finishReason) as FinishReason;

  return {
    responseMessages: response.messages,
    finishReason,
    responseMessage,
    totalMessageUsage,
  };
}

async function closeStream(writable: WritableStream<UIMessageChunk>) {
  "use step";

  await writable.close();
}
