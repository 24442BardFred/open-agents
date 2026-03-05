import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLastRepoByTeamScope } from "@/lib/db/last-repo";
import {
  getArchivedSessionCountByTeamScope,
  getSessionsWithUnreadByTeamScope,
} from "@/lib/db/sessions";
import { resolveActiveTeamIdForSession } from "@/lib/session/active-team";
import { getServerSession } from "@/lib/session/get-server-session";
import { SessionsIndexShell } from "./sessions-index-shell";

export const metadata: Metadata = {
  title: "Sessions",
  description: "View and manage your sessions.",
};

export default async function SessionsPage() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/");
  }

  const activeTeamId = await resolveActiveTeamIdForSession(session);

  const [lastRepo, sessions, archivedCount] = await Promise.all([
    getLastRepoByTeamScope({
      userId: session.user.id,
      teamId: activeTeamId,
      scope: "mine",
    }),
    getSessionsWithUnreadByTeamScope(session.user.id, activeTeamId, {
      status: "active",
      scope: "mine",
    }),
    getArchivedSessionCountByTeamScope({
      userId: session.user.id,
      teamId: activeTeamId,
      scope: "mine",
    }),
  ]);

  return (
    <SessionsIndexShell
      lastRepo={lastRepo}
      currentUser={session.user}
      initialSessionsData={{ sessions, archivedCount }}
    />
  );
}
