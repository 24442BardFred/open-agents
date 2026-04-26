# Browser Navigation Reference

This reference covers navigation patterns, URL handling, and page traversal techniques for the agent-browser skill.

## Basic Navigation

### Navigate to URL

Use the `goto` action to navigate to a specific URL:

```json
{
  "action": "goto",
  "url": "https://example.com"
}
```

**Options:**
- `waitUntil`: When to consider navigation complete
  - `load` (default): Wait for `load` event
  - `domcontentloaded`: Wait for DOMContentLoaded
  - `networkidle`: Wait until no network requests for 500ms
  - `commit`: Navigation committed, response received
- `timeout`: Maximum wait time in milliseconds (default: 30000)

```json
{
  "action": "goto",
  "url": "https://example.com/dashboard",
  "waitUntil": "networkidle",
  "timeout": 60000
}
```

### Back and Forward

Navigate browser history:

```json
{ "action": "goBack" }
{ "action": "goForward" }
```

Both support the same `waitUntil` and `timeout` options as `goto`.

### Reload Page

```json
{
  "action": "reload",
  "waitUntil": "load"
}
```

---

## Waiting for Navigation

When an action triggers navigation (e.g., clicking a link or submitting a form), use `waitForNavigation` to ensure the page has fully loaded before proceeding.

```json
{
  "action": "waitForNavigation",
  "waitUntil": "networkidle",
  "timeout": 30000
}
```

### Combined Click + Navigation Pattern

For reliable navigation via click:

```json
[
  { "action": "click", "ref": "e12" },
  { "action": "waitForNavigation", "waitUntil": "load" }
]
```

---

## URL Inspection

### Get Current URL

Retrieve the current page URL from the snapshot metadata:

```json
{ "action": "snapshot" }
```

The snapshot response includes:
```json
{
  "url": "https://example.com/current-page",
  "title": "Page Title",
  "elements": [...]
}
```

---

## Handling Redirects

Redirects are followed automatically. To detect the final URL after a redirect chain, use `networkidle` wait strategy and inspect the snapshot URL.

**Example — Follow redirect and verify landing page:**

```json
[
  { "action": "goto", "url": "https://example.com/login", "waitUntil": "networkidle" },
  { "action": "snapshot" }
]
```

Check `snapshot.url` to confirm the final destination.

---

## Multi-Tab Navigation

### Open New Tab

```json
{ "action": "newTab" }
```

### Switch Between Tabs

Tabs are referenced by index (0-based):

```json
{ "action": "switchTab", "index": 1 }
```

### Close Tab

```json
{ "action": "closeTab", "index": 1 }
```

### Open Link in New Tab

Hold modifier key when clicking:

```json
{
  "action": "click",
  "ref": "e34",
  "modifiers": ["Meta"]
}
```

---

## Frame Navigation

For pages with iframes, target a specific frame by its reference:

```json
{
  "action": "frameSnapshot",
  "frameRef": "frame-checkout"
}
```

Frame refs are returned in the parent snapshot under `frames[]`.

---

## Common Patterns

### Wait for Specific URL

Poll snapshot until URL matches expected pattern:

```bash
# In shell templates, use a loop:
until [[ "$CURRENT_URL" == *"/dashboard"* ]]; do
  sleep 1
  CURRENT_URL=$(get_snapshot_url)
done
```

### Handle Navigation Timeout

If navigation exceeds the timeout, the action returns an error. Increase `timeout` for slow pages or use `domcontentloaded` for faster resolution at the cost of waiting for all resources.

### SPA Navigation

For Single Page Applications that update the URL without a full page load:

```json
{
  "action": "waitForURL",
  "pattern": "**/dashboard**",
  "timeout": 15000
}
```

---

## Notes

- Always prefer `networkidle` for pages with async data loading.
- Use `domcontentloaded` for performance-sensitive workflows where full resource loading is not required.
- Snapshot refs (element `ref` values) are invalidated after navigation — always take a fresh snapshot after navigating.
- See [snapshot-refs.md](./snapshot-refs.md) for details on ref lifecycle.
