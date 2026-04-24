#!/usr/bin/env bash
# proxy-session.sh — Launch a browser session routed through a configurable proxy
# Part of the open-agents agent-browser skill
#
# Usage:
#   PROXY_URL=http://user:pass@proxy.example.com:8080 ./proxy-session.sh [url]
#
# Environment variables:
#   PROXY_URL        Full proxy URL including credentials (required)
#   PROXY_TYPE       Proxy protocol: http | https | socks5 (default: http)
#   SESSION_ID       Unique session identifier (auto-generated if not set)
#   CAPTURE_VIDEO    Set to "1" to record the session (default: 0)
#   HEADLESS         Set to "0" to run in headed mode (default: 1)
#   TIMEOUT          Navigation timeout in milliseconds (default: 30000)
#   OUTPUT_DIR       Directory for screenshots/recordings (default: ./output)

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
PROXY_TYPE="${PROXY_TYPE:-http}"
SESSION_ID="${SESSION_ID:-$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)}"
CAPTURE_VIDEO="${CAPTURE_VIDEO:-0}"
HEADLESS="${HEADLESS:-1}"
TIMEOUT="${TIMEOUT:-30000}"
OUTPUT_DIR="${OUTPUT_DIR:-./output}"
TARGET_URL="${1:-https://example.com}"

# ── Validation ───────────────────────────────────────────────────────────────
if [[ -z "${PROXY_URL:-}" ]]; then
  echo "[error] PROXY_URL is required." >&2
  echo "        Example: PROXY_URL=http://user:pass@proxy.host:8080" >&2
  exit 1
fi

if [[ ! "$PROXY_TYPE" =~ ^(http|https|socks5)$ ]]; then
  echo "[error] PROXY_TYPE must be one of: http, https, socks5" >&2
  exit 1
fi

# ── Setup ────────────────────────────────────────────────────────────────────
mkdir -p "${OUTPUT_DIR}/${SESSION_ID}"

echo "[info] Session  : ${SESSION_ID}"
echo "[info] Proxy    : ${PROXY_TYPE}://<redacted>"
echo "[info] Target   : ${TARGET_URL}"
echo "[info] Headless : ${HEADLESS}"
echo "[info] Output   : ${OUTPUT_DIR}/${SESSION_ID}"

# ── Build Playwright / Node invocation ───────────────────────────────────────
# Inline Node script executed via heredoc to keep everything in one file.
node - <<EOF
const { chromium } = require('playwright');

(async () => {
  const proxyUrl = new URL(process.env.PROXY_URL);

  const proxyConfig = {
    server: \`${PROXY_TYPE}://\${proxyUrl.hostname}:\${proxyUrl.port}\`,
    ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username) } : {}),
    ...(proxyUrl.password ? { password: decodeURIComponent(proxyUrl.password) } : {}),
  };

  const browser = await chromium.launch({
    headless: ${HEADLESS} === '1' || ${HEADLESS} === 1,
    proxy: proxyConfig,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    recordVideo: ${CAPTURE_VIDEO} === '1'
      ? { dir: '${OUTPUT_DIR}/${SESSION_ID}/video' }
      : undefined,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(${TIMEOUT});

  try {
    console.log('[browser] Navigating to ${TARGET_URL}');
    const response = await page.goto('${TARGET_URL}', { waitUntil: 'networkidle' });
    console.log('[browser] HTTP status:', response?.status());

    // Capture a screenshot for verification
    const screenshotPath = '${OUTPUT_DIR}/${SESSION_ID}/screenshot.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('[browser] Screenshot saved:', screenshotPath);

    // Emit page title so callers can assert proxy routing worked
    const title = await page.title();
    console.log('[browser] Page title:', title);
  } finally {
    await context.close();
    await browser.close();
    console.log('[browser] Session closed:', '${SESSION_ID}');
  }
})().catch((err) => {
  console.error('[browser] Fatal error:', err.message);
  process.exit(1);
});
EOF
