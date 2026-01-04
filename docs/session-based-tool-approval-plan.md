# Saved Tool Approval Preferences

This plan replaces the older session-based approval plan. It reflects the
current TUI and tool behavior and adds saved (persisted) preferences.

## Current State

- The TUI uses `ApprovalPanel` (`src/tui/components/approval-panel.tsx`) for
  approvals; the "Yes, and don't ask again" option is a placeholder and does
  not persist anything.
- `autoAcceptMode` is stored in `ChatContext` and cycled via shift+tab in the
  input (default: `"edits"`), but it is not wired to approval handling.
- `deepAgent` tools are static. Approvals are determined per-tool:
  - `bash` uses safe command prefixes and dangerous patterns.
  - `write`/`edit` always require approval (and always require approval for
    paths outside the working directory).
  - `read`/`grep`/`glob` require approval only for paths outside the working
    directory.
  - `task` requires approval for `executor` subagents.
- `sharedContext.workingDirectory` is used for path checks in `needsApproval`.

## Goals

1. Persist approvals within a single session so "don't ask again" immediately
   suppresses repeat prompts for similar requests.
2. Auto-approve when a session rule (or auto-accept mode) matches a tool
   request.
3. Keep a clear UI path to save and clear preferences.
4. Preserve safety defaults, especially for paths outside the working
   directory.

## Non-Goals

- Changing tool approval logic in the agent (use UI-level auto-approval).
- Syncing preferences across machines.

## Approach

Handle auto-approval in the TUI: when a tool part is in
`approval-requested`, check `autoAcceptMode` and *session rules*, then send
`addToolApprovalResponse`. This keeps tool definitions unchanged and aligns
with the AI SDK approval flow.

## Data Model

- Maintain an in-memory rule set for the current session (source of truth for
  auto-approval).
- Validate with Zod and include a version field for future migrations.

Example structure:

```json
{
  "version": 1,
  "autoAcceptMode": "off",
  "rules": [
    {
      "id": "uuid",
      "tool": "bash",
      "rule": { "type": "command-prefix", "value": "bun test" },
      "scope": { "cwd": "/Users/me/project" },
      "createdAt": 1710000000000,
      "lastUsedAt": 1710000100000
    }
  ]
}
```

Rule types to support:
- `command-prefix` for bash (matches command startsWith prefix, optionally with
  simple wildcard like `git diff` + pattern).
- `path-glob` for write/edit/read/grep/glob (relative to working directory).
- `subagent-type` for task tool (executor/explorer).

## Implementation Plan

### Phase 1: Session Rule Store + Context

- Add `src/tui/approval-preferences.ts` (or
  `src/tui/state/approval-preferences.ts`):
  - Zod schemas for `ApprovalRule` and `ApprovalPreferences`.
  - In-memory `rules` and helpers: `matchRule`, `touchRule`, `addRule`,
    `clearRules`.
- Add `ApprovalPreferencesProvider` to expose session rules to the UI.

### Phase 2: Wire Auto-Approval (Session-First)

- In `src/tui/app.tsx`, add a `useEffect` that:
  - detects the active `approval-requested` tool part
  - decides `shouldAutoApprove` based on:
    - `autoAcceptMode === "all"`
    - `autoAcceptMode === "edits"` and tool is `write`/`edit` (and path is
      inside cwd)
    - `matchesSessionRule(pendingToolPart, rules)`
  - calls `addToolApprovalResponse` and updates `lastUsedAt`
  - keeps a local set of handled `approvalId`s to avoid repeated approvals on
    re-render.
- Consider setting default `autoAcceptMode` to `"off"` once wired up to avoid
  silent auto-approvals on first run.

### Phase 3: Rule Inference + "Don't Ask Again"

- Update `getToolApprovalInfo` to return both a display label and a structured
  rule candidate (session rule).
- Update `ApprovalPanel` (and `ApprovalButtons` for task rows) to:
  - store the rule in the session when "Yes, and don't ask again" is chosen
  - then approve the request.
- Rule inference suggestions:
  - Bash: first 1-2 tokens (e.g., `git diff`, `bun test`) as
    `command-prefix`, optionally with a file glob if present (e.g.,
    `git diff *.md`).
  - Write/Edit: directory-based `path-glob` (`src/components/**`) when inside
    cwd.
  - Read/Grep/Glob: only offer when the path is inside cwd; outside-cwd can
    stay manual unless explicitly allowed.
  - Task: `subagent-type` rule for `executor`.

### Phase 4: Manage Session

- Add a minimal clearing surface:
  - Option A: add "Clear approvals for this session" to `ApprovalPanel` footer.
  - Option B: add a keybinding in `InputBox` (for example ctrl+shift+a) to
    clear rules.
- Display a small indicator when auto-approving (optional but helpful).

## Files to Modify

Phase 1-3:
- `src/tui/app.tsx` (auto-approval effect)
- `src/tui/components/approval-panel.tsx`
- `src/tui/components/tool-call.tsx`
- `src/tui/components/task-group-view.tsx`
- `src/tui/chat-context.tsx` (autoAcceptMode persistence if desired)
- `src/tui/index.tsx` (wrap new provider)

New files:
- `src/tui/approval-preferences.ts` (store + matching)

## User Experience

1. Tool requests approval and ApprovalPanel appears.
2. User selects "Yes" or "Yes, and don't ask again for <pattern>".
3. The rule is stored for the session; future matching approvals are
   auto-approved in the same session.
4. Auto-accept mode still works via shift+tab, now enforced.

## Security Considerations

- Keep rules scoped to the current working directory.
- Do not auto-approve outside-cwd paths unless a specific session rule exists.
- Bash safety list still applies; preferences only respond to approval
  requests, they do not bypass tool safety checks.

## Validation

- Unit test rule matching and rule inference.
- Manual: approve `bun test` once, confirm future `bun test` auto-approves.
- Manual: confirm write/edit auto-approval only occurs within cwd.
