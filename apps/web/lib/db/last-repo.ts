import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { SessionScope } from "./sessions";
import { db } from "./client";
import { sessions } from "./schema";

/**
 * Returns the repo info from the user's most recently created session
 * that was started from a repository, or null if none exists.
 */
export async function getLastRepoByUserId(userId: string) {
  const row = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.userId, userId),
      isNotNull(sessions.repoOwner),
      isNotNull(sessions.repoName),
    ),
    orderBy: [desc(sessions.createdAt)],
    columns: {
      repoOwner: true,
      repoName: true,
    },
  });

  if (!row?.repoOwner || !row?.repoName) return null;

  return {
    owner: row.repoOwner,
    repo: row.repoName,
  };
}

export async function getLastRepoByTeamScope(input: {
  userId: string;
  teamId: string;
  scope?: SessionScope;
}) {
  const scope = input.scope ?? "mine";
  const scopeFilter =
    scope === "team"
      ? eq(sessions.teamId, input.teamId)
      : and(
          eq(sessions.teamId, input.teamId),
          eq(sessions.userId, input.userId),
        );

  const row = await db.query.sessions.findFirst({
    where: and(
      scopeFilter,
      isNotNull(sessions.repoOwner),
      isNotNull(sessions.repoName),
    ),
    orderBy: [desc(sessions.createdAt)],
    columns: {
      repoOwner: true,
      repoName: true,
    },
  });

  if (!row?.repoOwner || !row?.repoName) return null;

  return {
    owner: row.repoOwner,
    repo: row.repoName,
  };
}
