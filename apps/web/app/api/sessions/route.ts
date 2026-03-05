import { nanoid } from "nanoid";
import {
  createSessionWithInitialChat,
  getArchivedSessionCountByTeamScope,
  getSessionsWithUnreadByTeamScope,
  getUsedSessionTitlesByTeamScope,
  type SessionScope,
} from "@/lib/db/sessions";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { getRandomCityName } from "@/lib/random-city";
import { resolveActiveTeamIdForSession } from "@/lib/session/active-team";
import { getServerSession } from "@/lib/session/get-server-session";

interface CreateSessionRequest {
  title?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  cloneUrl?: string;
  isNewBranch?: boolean;
  sandboxType?: "hybrid" | "vercel" | "just-bash";
}

function generateBranchName(username: string, name?: string | null): string {
  let initials = "nb";
  if (name) {
    initials =
      name
        .split(" ")
        .map((n) => n[0]?.toLowerCase() ?? "")
        .join("")
        .slice(0, 2) || "nb";
  } else if (username) {
    initials = username.slice(0, 2).toLowerCase();
  }
  const randomSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${initials}/${randomSuffix}`;
}

async function resolveSessionTitle(
  input: CreateSessionRequest,
  userId: string,
  teamId: string,
): Promise<string> {
  if (input.title && input.title.trim()) {
    return input.title.trim();
  }
  const usedNames = await getUsedSessionTitlesByTeamScope({
    userId,
    teamId,
    scope: "mine",
  });
  return getRandomCityName(usedNames);
}

const DEFAULT_ARCHIVED_SESSIONS_LIMIT = 50;
const MAX_ARCHIVED_SESSIONS_LIMIT = 100;

type SessionsStatusFilter = "all" | "active" | "archived";
type SessionsScopeFilter = SessionScope;

function parseNonNegativeInteger(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  if (!/^[0-9]+$/.test(value)) {
    return null;
  }

  return Number(value);
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get("status");
  if (
    rawStatus !== null &&
    rawStatus !== "all" &&
    rawStatus !== "active" &&
    rawStatus !== "archived"
  ) {
    return Response.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const rawScope = searchParams.get("scope");
  if (rawScope !== null && rawScope !== "mine" && rawScope !== "team") {
    return Response.json({ error: "Invalid scope filter" }, { status: 400 });
  }

  const statusParam: SessionsStatusFilter = rawStatus ?? "all";
  const scopeParam: SessionsScopeFilter = rawScope ?? "mine";
  const teamId = await resolveActiveTeamIdForSession(session);

  if (statusParam === "archived") {
    const rawLimit = parseNonNegativeInteger(searchParams.get("limit"));
    const rawOffset = parseNonNegativeInteger(searchParams.get("offset"));

    if (searchParams.get("limit") !== null && rawLimit === null) {
      return Response.json(
        { error: "Invalid archived limit" },
        { status: 400 },
      );
    }

    if (searchParams.get("offset") !== null && rawOffset === null) {
      return Response.json(
        { error: "Invalid archived offset" },
        { status: 400 },
      );
    }

    const limit = Math.min(
      Math.max(rawLimit ?? DEFAULT_ARCHIVED_SESSIONS_LIMIT, 1),
      MAX_ARCHIVED_SESSIONS_LIMIT,
    );
    const offset = rawOffset ?? 0;

    const [sessions, archivedCount] = await Promise.all([
      getSessionsWithUnreadByTeamScope(session.user.id, teamId, {
        status: "archived",
        scope: scopeParam,
        limit,
        offset,
      }),
      getArchivedSessionCountByTeamScope({
        userId: session.user.id,
        teamId,
        scope: scopeParam,
      }),
    ]);

    return Response.json({
      sessions,
      archivedCount,
      pagination: {
        limit,
        offset,
        hasMore: offset + sessions.length < archivedCount,
        nextOffset: offset + sessions.length,
      },
    });
  }

  if (statusParam === "active") {
    const [sessions, archivedCount] = await Promise.all([
      getSessionsWithUnreadByTeamScope(session.user.id, teamId, {
        status: "active",
        scope: scopeParam,
      }),
      getArchivedSessionCountByTeamScope({
        userId: session.user.id,
        teamId,
        scope: scopeParam,
      }),
    ]);

    return Response.json({ sessions, archivedCount });
  }

  const sessions = await getSessionsWithUnreadByTeamScope(
    session.user.id,
    teamId,
    {
      scope: scopeParam,
    },
  );
  return Response.json({ sessions });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: CreateSessionRequest;
  try {
    body = (await req.json()) as CreateSessionRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    repoOwner,
    repoName,
    branch,
    cloneUrl,
    isNewBranch,
    sandboxType = "hybrid",
  } = body;

  let finalBranch = branch;
  if (isNewBranch) {
    finalBranch = generateBranchName(session.user.username, session.user.name);
  }

  try {
    const teamId = await resolveActiveTeamIdForSession(session);
    const title = await resolveSessionTitle(body, session.user.id, teamId);
    const preferences = await getUserPreferences(session.user.id);
    const result = await createSessionWithInitialChat({
      session: {
        id: nanoid(),
        userId: session.user.id,
        teamId,
        title,
        status: "running",
        repoOwner,
        repoName,
        branch: finalBranch,
        cloneUrl,
        isNewBranch: isNewBranch ?? false,
        sandboxState: { type: sandboxType },
        lifecycleState: "provisioning",
        lifecycleVersion: 0,
      },
      initialChat: {
        id: nanoid(),
        title: "New chat",
        modelId: preferences.defaultModelId,
      },
    });

    return Response.json(result);
  } catch (error) {
    console.error("Failed to create session:", error);
    return Response.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}
