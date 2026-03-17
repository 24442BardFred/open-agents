import { getRun } from "workflow/api";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { chatId } = await context.params;

  const chatContext = await requireOwnedChatById({
    userId: authResult.userId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { chat } = chatContext;

  if (!chat.activeStreamId) {
    return Response.json({ success: true });
  }

  try {
    const run = getRun(chat.activeStreamId);
    await run.cancel();
  } catch (error) {
    console.error(
      `[workflow] Failed to cancel workflow run for chat ${chatId}:`,
      error,
    );
    return Response.json(
      { error: "Failed to cancel workflow run" },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}
