"use client";

import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { InboxSidebar } from "@/components/inbox-sidebar";
import { NewSessionDialog } from "@/components/new-session-dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useBackgroundChatNotifications } from "@/hooks/use-background-chat-notifications";
import { useSessions, type SessionWithUnread } from "@/hooks/use-sessions";
import type { Session as AuthSession } from "@/lib/session/types";
import { cn } from "@/lib/utils";
import { SessionsShellProvider } from "./sessions-shell-context";

type SessionsRouteShellProps = {
  children: ReactNode;
  currentUser: AuthSession["user"];
  initialSessionsData?: {
    sessions: SessionWithUnread[];
    archivedCount: number;
  };
  lastRepo: { owner: string; repo: string } | null;
};

export function SessionsRouteShell({
  children,
  currentUser,
  initialSessionsData,
  lastRepo,
}: SessionsRouteShellProps) {
  const router = useRouter();
  const params = useParams<{ sessionId?: string }>();
  const routeSessionId =
    typeof params.sessionId === "string" ? params.sessionId : null;
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [optimisticActiveSessionId, setOptimisticActiveSessionId] = useState<
    string | null
  >(null);
  const [isNavigating, startNavigationTransition] = useTransition();
  const prefetchedSessionHrefsRef = useRef(new Set<string>());

  const {
    sessions,
    archivedCount,
    loading: sessionsLoading,
    createSession,
    renameSession,
    archiveSession,
  } = useSessions({
    enabled: true,
    includeArchived: false,
    initialData: initialSessionsData,
  });

  const getSessionHref = useCallback((targetSession: SessionWithUnread) => {
    if (targetSession.latestChatId) {
      return `/sessions/${targetSession.id}/chats/${targetSession.latestChatId}`;
    }

    return `/sessions/${targetSession.id}`;
  }, []);

  const openNewSessionDialog = useCallback(() => {
    setNewSessionOpen(true);
  }, []);

  const handleSessionClick = useCallback(
    (targetSession: SessionWithUnread) => {
      setOptimisticActiveSessionId(targetSession.id);
      startNavigationTransition(() => {
        router.push(getSessionHref(targetSession));
      });
    },
    [getSessionHref, router, startNavigationTransition],
  );

  const handleSessionPrefetch = useCallback(
    (targetSession: SessionWithUnread) => {
      const href = getSessionHref(targetSession);
      if (prefetchedSessionHrefsRef.current.has(href)) {
        return;
      }

      prefetchedSessionHrefsRef.current.add(href);
      router.prefetch(href);
    },
    [getSessionHref, router],
  );

  const handleRenameSession = useCallback(
    async (targetSessionId: string, title: string) => {
      await renameSession(targetSessionId, title);
    },
    [renameSession],
  );

  const handleArchiveSession = useCallback(
    async (targetSessionId: string) => {
      await archiveSession(targetSessionId);

      if (targetSessionId === routeSessionId) {
        setOptimisticActiveSessionId(null);
        startNavigationTransition(() => {
          router.push("/sessions");
        });
      }
    },
    [archiveSession, routeSessionId, router, startNavigationTransition],
  );

  useEffect(() => {
    if (
      optimisticActiveSessionId &&
      optimisticActiveSessionId === routeSessionId
    ) {
      setOptimisticActiveSessionId(null);
    }
  }, [optimisticActiveSessionId, routeSessionId]);

  const activeSessionId = optimisticActiveSessionId ?? routeSessionId ?? "";
  const pendingSessionId = isNavigating ? optimisticActiveSessionId : null;
  const panelOpen = Boolean(routeSessionId);

  useBackgroundChatNotifications(sessions, routeSessionId, handleSessionClick);

  const handleClosePanel = useCallback(() => {
    setOptimisticActiveSessionId(null);
    startNavigationTransition(() => {
      router.push("/sessions");
    });
  }, [router, startNavigationTransition]);

  const shellContextValue = useMemo(
    () => ({
      openNewSessionDialog,
    }),
    [openNewSessionDialog],
  );

  return (
    <SessionsShellProvider value={shellContextValue}>
      {/* SidebarProvider kept for context compatibility with useSidebar consumers in session detail */}
      <SidebarProvider className="h-dvh overflow-hidden">
        {/* Inbox — always visible as the main content */}
        <div className="flex h-dvh w-full flex-col overflow-hidden">
          <InboxSidebar
            sessions={sessions}
            archivedCount={archivedCount}
            sessionsLoading={sessionsLoading}
            activeSessionId={activeSessionId}
            pendingSessionId={pendingSessionId}
            onSessionClick={handleSessionClick}
            onSessionPrefetch={handleSessionPrefetch}
            onRenameSession={handleRenameSession}
            onArchiveSession={handleArchiveSession}
            onOpenNewSession={openNewSessionDialog}
            initialUser={currentUser}
          />
        </div>

        {/* Backdrop */}
        <button
          type="button"
          className={cn(
            "fixed inset-0 z-40 bg-black/20 transition-opacity duration-200",
            panelOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={handleClosePanel}
          tabIndex={-1}
          aria-label="Close session panel"
        />

        {/* Session detail panel — slides from right */}
        <div
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-full border-l border-border bg-background shadow-xl transition-transform duration-200 ease-out sm:w-[min(72vw,64rem)]",
            panelOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex h-full flex-col overflow-hidden">{children}</div>
        </div>
      </SidebarProvider>

      <NewSessionDialog
        open={newSessionOpen}
        onOpenChange={setNewSessionOpen}
        lastRepo={lastRepo}
        createSession={createSession}
      />
    </SessionsShellProvider>
  );
}
