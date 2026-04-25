#!/usr/bin/env bash
# screenshot-capture.sh
# Template for capturing screenshots at specific workflow steps using agent-browser.
# Supports full-page, viewport, and element-level captures with optional annotations.
#
# Usage:
#   ./screenshot-capture.sh [options]
#
# Options:
#   --url <url>             Target URL to navigate to (required)
#   --output-dir <path>     Directory to save screenshots (default: ./screenshots)
#   --mode <mode>           Capture mode: full-page | viewport | element (default: viewport)
#   --selector <css>        CSS selector for element capture mode
#   --annotate              Add timestamp and URL annotations to screenshots
#   --format <fmt>          Image format: png | jpeg | webp (default: png)
#   --quality <0-100>       Image quality for jpeg/webp (default: 90)
#   --wait <ms>             Wait time in ms before capturing (default: 500)
#   --session-id <id>       Reuse an existing browser session
#   --help                  Show this help message

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
TARGET_URL=""
OUTPUT_DIR="./screenshots"
CAPTURE_MODE="viewport"
CSS_SELECTOR=""
ANNOTATE=false
IMAGE_FORMAT="png"
IMAGE_QUALITY=90
WAIT_MS=500
SESSION_ID=""

# ── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)         TARGET_URL="$2";      shift 2 ;;
    --output-dir)  OUTPUT_DIR="$2";      shift 2 ;;
    --mode)        CAPTURE_MODE="$2";    shift 2 ;;
    --selector)    CSS_SELECTOR="$2";    shift 2 ;;
    --annotate)    ANNOTATE=true;        shift   ;;
    --format)      IMAGE_FORMAT="$2";    shift 2 ;;
    --quality)     IMAGE_QUALITY="$2";   shift 2 ;;
    --wait)        WAIT_MS="$2";         shift 2 ;;
    --session-id)  SESSION_ID="$2";      shift 2 ;;
    --help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ── Validation ───────────────────────────────────────────────────────────────
if [[ -z "$TARGET_URL" ]]; then
  echo "Error: --url is required." >&2
  exit 1
fi

if [[ "$CAPTURE_MODE" == "element" && -z "$CSS_SELECTOR" ]]; then
  echo "Error: --selector is required when --mode is 'element'." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# ── Build agent-browser payload ──────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="screenshot_${TIMESTAMP}.${IMAGE_FORMAT}"
OUTPUT_PATH="${OUTPUT_DIR}/${FILENAME}"

PAYLOAD=$(cat <<EOF
{
  "url": "${TARGET_URL}",
  "actions": [
    { "type": "wait", "duration": ${WAIT_MS} },
    {
      "type": "screenshot",
      "mode": "${CAPTURE_MODE}",
      "selector": "${CSS_SELECTOR}",
      "format": "${IMAGE_FORMAT}",
      "quality": ${IMAGE_QUALITY},
      "annotate": ${ANNOTATE},
      "outputPath": "${OUTPUT_PATH}"
    }
  ],
  "sessionId": "${SESSION_ID}"
}
EOF
)

# ── Execute ──────────────────────────────────────────────────────────────────
echo "Capturing screenshot..."
echo "  URL      : ${TARGET_URL}"
echo "  Mode     : ${CAPTURE_MODE}"
echo "  Format   : ${IMAGE_FORMAT}"
echo "  Output   : ${OUTPUT_PATH}"

RESPONSE=$(curl -sS -X POST "${AGENT_BROWSER_API_URL:-http://localhost:3000}/api/browser/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AGENT_BROWSER_API_KEY:-}" \
  -d "$PAYLOAD")

# ── Result handling ───────────────────────────────────────────────────────────
STATUS=$(echo "$RESPONSE" | jq -r '.status // "unknown"')

if [[ "$STATUS" == "success" ]]; then
  echo "Screenshot saved: ${OUTPUT_PATH}"
else
  ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
  echo "Error capturing screenshot: ${ERROR}" >&2
  exit 1
fi
