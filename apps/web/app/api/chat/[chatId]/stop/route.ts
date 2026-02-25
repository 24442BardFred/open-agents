import { getRun } from "workflow/api";
import { getChatById, getSessionById, updateChatActiveStreamId } from "@/lib/db/sessions";
import { createRedisClient } from "@/lib/redis";
import { getServerSession } from "@/lib/session/get-server-session";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { chatId } = await context.params;

  const chat = await getChatById(chatId);
  if (!chat) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  // Verify ownership through the session chain
  const sessionRecord = await getSessionById(chat.sessionId);
  if (!sessionRecord || sessionRecord.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeStreamId = chat.activeStreamId;
  if (!activeStreamId) {
    return Response.json({ success: true });
  }

  const firstSeparator = activeStreamId.indexOf(":");
  const secondSeparator = activeStreamId.indexOf(":", firstSeparator + 1);
  const workflowRunId =
    firstSeparator >= 0 && secondSeparator > firstSeparator
      ? activeStreamId.slice(firstSeparator + 1, secondSeparator)
      : null;

  if (workflowRunId) {
    try {
      await getRun(workflowRunId).cancel();
      await updateChatActiveStreamId(chatId, null);
      return Response.json({ success: true });
    } catch (error) {
      console.error("Failed to cancel workflow run, falling back to stop signal:", error);
    }
  }

  // Backward-compatible fallback for non-workflow streams.
  const publisher = createRedisClient();
  await publisher.publish(`stop:${chatId}`, "stop");
  publisher.disconnect();

  return Response.json({ success: true });
}
