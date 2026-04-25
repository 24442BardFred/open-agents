#!/usr/bin/env bash
# video-recording.sh — Capture a browser session as a video using Playwright
# Part of the open-agents agent-browser skill
#
# Usage:
#   ./video-recording.sh <url> [output_dir] [width] [height]
#
# Dependencies:
#   - npx / Node.js with @playwright/test installed
#   - ffmpeg (optional, for post-processing)
#
# Environment variables:
#   BROWSER          Browser engine: chromium | firefox | webkit (default: chromium)
#   VIDEO_FPS        Frames per second for recording (default: 30)
#   HEADLESS         Run headless: true | false (default: true)
#   PROXY_SERVER     Optional proxy URL (e.g. http://proxy:8080)
#   AUTH_STORAGE     Path to auth storage JSON (from authenticated-session.sh)

set -euo pipefail

# ── Arguments ────────────────────────────────────────────────────────────────
TARGET_URL="${1:-https://example.com}"
OUTPUT_DIR="${2:-./recordings}"
VIEWPORT_WIDTH="${3:-1280}"
VIEWPORT_HEIGHT="${4:-720}"

# ── Config ───────────────────────────────────────────────────────────────────
BROWSER="${BROWSER:-chromium}"
VIDEO_FPS="${VIDEO_FPS:-30}"
HEADLESS="${HEADLESS:-true}"
PROXY_SERVER="${PROXY_SERVER:-}"
AUTH_STORAGE="${AUTH_STORAGE:-}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SESSION_ID="recording_${TIMESTAMP}"
OUTPUT_PATH="${OUTPUT_DIR}/${SESSION_ID}"

mkdir -p "${OUTPUT_PATH}"

echo "[agent-browser] Starting video recording session: ${SESSION_ID}"
echo "[agent-browser] Target URL : ${TARGET_URL}"
echo "[agent-browser] Output path: ${OUTPUT_PATH}"
echo "[agent-browser] Browser    : ${BROWSER} (headless=${HEADLESS})"
echo "[agent-browser] Viewport   : ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT} @ ${VIDEO_FPS}fps"

# ── Playwright script ─────────────────────────────────────────────────────────
cat > /tmp/record_session_${SESSION_ID}.mjs <<PLAYWRIGHT_SCRIPT
import { chromium, firefox, webkit } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const browserType = { chromium, firefox, webkit }['${BROWSER}'] ?? chromium;

const launchOptions = {
  headless: ${HEADLESS},
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ],
  ${PROXY_SERVER:+proxyServer: '${PROXY_SERVER}',}
};

const browser = await browserType.launch(launchOptions);

const contextOptions = {
  viewport: { width: ${VIEWPORT_WIDTH}, height: ${VIEWPORT_HEIGHT} },
  recordVideo: {
    dir: '${OUTPUT_PATH}',
    size: { width: ${VIEWPORT_WIDTH}, height: ${VIEWPORT_HEIGHT} },
  },
  ${AUTH_STORAGE:+storageState: '${AUTH_STORAGE}',}
};

const context = await browser.newContext(contextOptions);
const page = await context.newPage();

console.log('[playwright] Navigating to ${TARGET_URL}');
await page.goto('${TARGET_URL}', { waitUntil: 'networkidle', timeout: 30000 });

// Allow the page to settle and capture meaningful content
await page.waitForTimeout(3000);

// Scroll down slowly to capture dynamic content
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
  await page.waitForTimeout(800);
}

// Scroll back to top
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1000);

const videoPath = await page.video()?.path();
console.log('[playwright] Raw video path:', videoPath);

await context.close();
await browser.close();

// Rename video to a predictable filename
if (videoPath && fs.existsSync(videoPath)) {
  const dest = path.join('${OUTPUT_PATH}', 'session.webm');
  fs.renameSync(videoPath, dest);
  console.log('[playwright] Video saved to:', dest);
} else {
  console.error('[playwright] ERROR: Video file not found after session close.');
  process.exit(1);
}
PLAYWRIGHT_SCRIPT

# ── Run recording ─────────────────────────────────────────────────────────────
npx --yes playwright install "${BROWSER}" --with-deps 2>/dev/null || true
node /tmp/record_session_${SESSION_ID}.mjs

# ── Optional: convert webm → mp4 with ffmpeg ──────────────────────────────────
if command -v ffmpeg &>/dev/null; then
  WEBM_FILE="${OUTPUT_PATH}/session.webm"
  MP4_FILE="${OUTPUT_PATH}/session.mp4"
  echo "[agent-browser] Converting WebM → MP4 via ffmpeg..."
  ffmpeg -y -i "${WEBM_FILE}" \
    -c:v libx264 -preset fast -crf 22 \
    -r "${VIDEO_FPS}" \
    -movflags +faststart \
    "${MP4_FILE}" 2>/dev/null
  echo "[agent-browser] MP4 saved: ${MP4_FILE}"
fi

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -f "/tmp/record_session_${SESSION_ID}.mjs"

echo "[agent-browser] Recording complete. Files in: ${OUTPUT_PATH}"
ls -lh "${OUTPUT_PATH}"
