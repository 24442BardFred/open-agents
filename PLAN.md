Summary: Add first-class teams so every session belongs to a team, create a default personal team for each user, and migrate existing user-owned sessions into those personal teams without data loss.

Context: 
- Current ownership model is user-scoped: `sessions.userId` is the only ownership key in `apps/web/lib/db/schema.ts`, and most routes enforce access with checks like `sessionRecord.userId !== session.user.id`.
- Session list/create flows are user-scoped via `getSessionsWithUnreadByUserId`, `getArchivedSessionCountByUserId`, `getUsedSessionTitles`, and `getLastRepoByUserId` in:
  - `apps/web/lib/db/sessions.ts`
  - `apps/web/lib/db/last-repo.ts`
  - `apps/web/app/sessions/page.tsx`
  - `apps/web/app/api/sessions/route.ts`
- Server-rendered session pages also enforce user ownership directly:
  - `apps/web/app/sessions/[sessionId]/layout.tsx`
  - `apps/web/app/sessions/[sessionId]/page.tsx`
- Login/session cookie is created in `apps/web/app/api/auth/vercel/callback/route.ts`; session payload currently has user identity but no active team context (`apps/web/lib/session/types.ts`).
- Migrations are Drizzle-based (`apps/web/lib/db/schema.ts` + generated SQL). `apps/web/lib/db/migrate.ts` can replay migrations on legacy schemas, so backfill SQL should be idempotent (avoid unique-violation failure paths).

Approach: 
- Introduce team primitives (`teams`, `team_members`) and make `sessions` team-scoped with a required `teamId`.
- Preserve `sessions.userId` as “creator” for backward compatibility/audit and to avoid broad breakage in one step.
- Add a personal-team invariant (exactly one personal team per user) and backfill all existing users/sessions to it.
- Add centralized team-resolution + access helpers so routes stop doing ad-hoc `session.user.id` ownership checks.
- Ship this in two implementation passes:
  1) foundation + migration + team-scoped authorization (no major UX change),
  2) collaborative UX (team switcher/invite management) once backend invariants are stable.

Changes:
- `apps/web/lib/db/schema.ts`
  - Add `teams` table (id, name, personalOwnerUserId, createdAt, updatedAt).
  - Add `teamMembers` table (teamId, userId, role, createdAt, updatedAt).
  - Add `sessions.teamId` FK to `teams.id` and index.
  - Keep `sessions.userId` for creator attribution.

- `apps/web/lib/db/migrations/<new>.sql` (generated + hand-edited for data migration)
  - Create `teams` and `team_members`.
  - Add nullable `sessions.team_id` first.
  - Backfill personal teams for existing users using deterministic IDs (idempotent insert).
  - Backfill team memberships (owner role) idempotently.
  - Backfill `sessions.team_id` from `sessions.user_id` -> personal team.
  - Enforce `sessions.team_id` NOT NULL + FK + index after backfill.

- `apps/web/lib/db/teams.ts` (new)
  - Add helpers:
    - `ensurePersonalTeamForUser(...)`
    - `getPersonalTeamForUser(userId)`
    - `listTeamsForUser(userId)`
    - `isUserMemberOfTeam(userId, teamId)`

- `apps/web/lib/session/types.ts`
  - Extend session payload to include `activeTeamId` (or equivalent active team context).

- `apps/web/app/api/auth/vercel/callback/route.ts`
  - After `upsertUser`, ensure personal team exists.
  - Set `activeTeamId` in session cookie payload.

- `apps/web/app/api/auth/info/route.ts`
  - Return active team metadata (and optionally team list) for client bootstrapping.

- `apps/web/lib/db/sessions.ts`
  - Add team-scoped query APIs (`getSessionsWithUnreadByTeamId`, `getArchivedSessionCountByTeamId`, `getUsedSessionTitlesByTeamId`), and update create-session path to require `teamId`.
  - Add/replace access helpers to fetch sessions constrained by team membership.

- `apps/web/lib/db/last-repo.ts`
  - Add team-scoped variant (`getLastRepoByTeamId`) and migrate callers.

- Session auth + API routes (team authorization refactor)
  - Add central helper (new file, e.g. `apps/web/lib/session/team-access.ts`) to:
    - resolve active team for request user,
    - validate membership,
    - enforce session belongs to that team.
  - Update routes/pages that currently gate on `sessionRecord.userId`, including:
    - `apps/web/app/api/sessions/**`
    - `apps/web/app/api/chat/**`
    - `apps/web/app/api/sandbox/**`
    - `apps/web/app/api/check-pr/route.ts`
    - `apps/web/app/api/generate-pr/route.ts`
    - `apps/web/app/api/git-status/route.ts`
    - `apps/web/app/api/github/create-repo/route.ts`
    - `apps/web/app/api/pr/route.ts`
    - `apps/web/app/sessions/[sessionId]/layout.tsx`
    - `apps/web/app/sessions/[sessionId]/page.tsx`

- Team-scoped session list/create callers
  - `apps/web/app/api/sessions/route.ts`
  - `apps/web/app/sessions/page.tsx`
  - `apps/web/app/sessions/[sessionId]/layout.tsx`

- Tests
  - Update route tests that mock `sessionRecord.userId` to also include/use `teamId` authorization.
  - Add migration/backfill assertions (at least integration-level checks around non-null `sessions.team_id`).

Verification:
- Automated
  - `bun run --cwd apps/web db:generate` (ensure migration generated from schema changes)
  - `bun run ci`
- Data migration checks (manual SQL spot checks in staging)
  - `SELECT COUNT(*) FROM sessions WHERE team_id IS NULL;` => 0
  - `SELECT COUNT(*) FROM users u LEFT JOIN teams t ON t.personal_owner_user_id = u.id WHERE t.id IS NULL;` => 0
  - `SELECT COUNT(*) FROM team_members tm LEFT JOIN teams t ON t.id = tm.team_id WHERE tm.role = 'owner';` matches user count
- Behavior checks
  - Existing user can still see pre-migration sessions after deploy.
  - New user login auto-creates personal team.
  - Session create/list/read/archive flows work under team scope.
  - Non-member cannot access another team’s sessions (403/redirect).

Open questions to confirm before implementation:
- Should phase 1 include invite + team switching UI/API, or should we land backend + migration first and follow with collaboration UX in phase 2?
- For multi-member teams, should all members be allowed to archive/delete sessions, or only owners/admins?