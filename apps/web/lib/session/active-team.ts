import { resolveActiveTeamIdForUser } from "@/lib/db/teams";
import type { Session } from "./types";

export async function resolveActiveTeamIdForSession(
  session: Session,
): Promise<string> {
  const user = session.user;
  if (!user) {
    throw new Error("Cannot resolve active team for unauthenticated session");
  }

  return resolveActiveTeamIdForUser({
    userId: user.id,
    username: user.username,
    preferredTeamId: session.activeTeamId,
  });
}
