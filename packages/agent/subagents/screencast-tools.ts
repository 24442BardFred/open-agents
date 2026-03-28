import { tool } from "ai";
import { basename } from "node:path";
import { z } from "zod";
import { getSandbox } from "../tools/utils";

const EXEC_TIMEOUT_MS = 120_000;
const MIN_VIDEO_BYTES = 50_000;

interface VideoProbeResult {
  success: boolean;
  filePath: string;
  exists: boolean;
  sizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasVideoStream: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// VTT parsing (shared)
// ---------------------------------------------------------------------------

interface VTTCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(":");
  let minutes: number;
  let secAndMs: string;

  if (parts.length === 3) {
    // HH:MM:SS.mmm
    minutes =
      parseInt(parts[0] ?? "0", 10) * 60 + parseInt(parts[1] ?? "0", 10);
    secAndMs = parts[2] ?? "0";
  } else {
    // MM:SS.mmm
    minutes = parseInt(parts[0] ?? "0", 10);
    secAndMs = parts[1] ?? "0";
  }

  const dotParts = secAndMs.split(".");
  const secStr = dotParts[0] ?? "0";
  const msStr = dotParts[1] ?? "0";
  const seconds = parseInt(secStr, 10);
  const ms = parseInt(msStr.padEnd(3, "0").slice(0, 3), 10);

  return (minutes * 60 + seconds) * 1000 + ms;
}

function parseVTT(content: string): VTTCue[] {
  const lines = content.split("\n");
  const cues: VTTCue[] = [];
  let i = 0;

  // Skip to first timestamp line
  while (i < lines.length && !lines[i]?.includes("-->")) i++;

  let cueIndex = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();
    if (line.includes("-->")) {
      const arrowParts = line.split("-->").map((s) => s.trim());
      const startStr = arrowParts[0] ?? "00:00.000";
      const endStr = arrowParts[1] ?? "00:00.000";
      const startMs = parseTimestamp(startStr);
      const endMs = parseTimestamp(endStr);

      i++;
      const textLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim() !== "") {
        textLines.push((lines[i] ?? "").trim());
        i++;
      }

      const text = textLines.join(" ");
      if (text) {
        cues.push({ index: cueIndex++, startMs, endMs, text });
      }
    } else {
      i++;
    }
  }

  return cues;
}

async function probeVideo(
  sandbox: Awaited<ReturnType<typeof getSandbox>>,
  filePath: string,
): Promise<VideoProbeResult> {
  const workDir = sandbox.workingDirectory;
  const ffprobePath = (
    await sandbox.exec("which ffprobe || true", workDir, EXEC_TIMEOUT_MS)
  ).stdout.trim();

  const statResult = await sandbox.exec(
    `if [ -f '${filePath}' ]; then stat -c '%s' '${filePath}'; else echo missing; fi`,
    workDir,
    EXEC_TIMEOUT_MS,
  );

  if (!statResult.success) {
    return {
      success: false,
      filePath,
      exists: false,
      sizeBytes: 0,
      hasVideoStream: false,
      error: `Failed to stat file: ${filePath}`,
    };
  }

  const statOutput = statResult.stdout.trim();
  if (statOutput === "missing") {
    return {
      success: false,
      filePath,
      exists: false,
      sizeBytes: 0,
      hasVideoStream: false,
      error: `File does not exist: ${filePath}`,
    };
  }

  const sizeBytes = Number.parseInt(statOutput, 10);
  if (!Number.isFinite(sizeBytes)) {
    return {
      success: false,
      filePath,
      exists: true,
      sizeBytes: 0,
      hasVideoStream: false,
      error: `Unable to determine file size for: ${filePath}`,
    };
  }

  if (!ffprobePath) {
    return {
      success: sizeBytes >= MIN_VIDEO_BYTES,
      filePath,
      exists: true,
      sizeBytes,
      hasVideoStream: sizeBytes >= MIN_VIDEO_BYTES,
      error:
        sizeBytes >= MIN_VIDEO_BYTES
          ? undefined
          : "Video file is too small and ffprobe is unavailable for deeper validation.",
    };
  }

  const probeResult = await sandbox.exec(
    `${ffprobePath} -v error -print_format json -show_streams -show_format '${filePath}'`,
    workDir,
    EXEC_TIMEOUT_MS,
  );

  if (!probeResult.success || !probeResult.stdout.trim()) {
    return {
      success: false,
      filePath,
      exists: true,
      sizeBytes,
      hasVideoStream: false,
      error: `ffprobe failed for: ${filePath}`,
    };
  }

  try {
    const parsed = JSON.parse(probeResult.stdout) as {
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        duration?: string;
      }>;
      format?: {
        duration?: string;
      };
    };

    const videoStream = parsed.streams?.find(
      (stream) => stream.codec_type === "video",
    );
    const durationSeconds = Number.parseFloat(
      videoStream?.duration ?? parsed.format?.duration ?? "0",
    );
    const width = videoStream?.width;
    const height = videoStream?.height;
    const hasVideoStream = Boolean(videoStream);
    const durationLooksValid =
      Number.isFinite(durationSeconds) && durationSeconds >= 1;
    const dimensionsLookValid =
      typeof width === "number" &&
      width > 0 &&
      typeof height === "number" &&
      height > 0;
    const success =
      hasVideoStream &&
      durationLooksValid &&
      dimensionsLookValid &&
      sizeBytes >= MIN_VIDEO_BYTES;

    return {
      success,
      filePath,
      exists: true,
      sizeBytes,
      durationSeconds: Number.isFinite(durationSeconds)
        ? durationSeconds
        : undefined,
      width,
      height,
      hasVideoStream,
      error: success
        ? undefined
        : `Invalid video output for ${filePath}: hasVideoStream=${hasVideoStream}, duration=${Number.isFinite(durationSeconds) ? durationSeconds : "unknown"}, sizeBytes=${sizeBytes}, width=${width ?? "unknown"}, height=${height ?? "unknown"}`,
    };
  } catch (error) {
    return {
      success: false,
      filePath,
      exists: true,
      sizeBytes,
      hasVideoStream: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// synthesize_voiceover
// ---------------------------------------------------------------------------

const synthesizeInputSchema = z.object({
  vttPath: z.string().describe("Path to the VTT narration script"),
  outputDir: z
    .string()
    .optional()
    .describe("Directory for audio segments (default: /tmp/screencast-audio)"),
});

export const synthesizeVoiceoverTool = () =>
  tool({
    description:
      "Synthesize speech audio from a VTT narration script using ElevenLabs TTS. " +
      "Reads the VTT file, generates speech for each cue, and writes audio segments to disk. " +
      "Requires ELEVENLABS_API_KEY environment variable.",
    inputSchema: synthesizeInputSchema,
    execute: async (
      { vttPath, outputDir },
      { experimental_context, abortSignal },
    ) => {
      const sandbox = await getSandbox(experimental_context, "synthesize");
      const workDir = sandbox.workingDirectory;
      const segmentDir = outputDir ?? "/tmp/screencast-audio";

      // Read VTT
      const vttContent = await sandbox.readFile(vttPath, "utf-8");
      const cues = parseVTT(vttContent);

      if (cues.length === 0) {
        return { success: false, error: "No cues found in VTT file" };
      }

      // Ensure output directory exists
      await sandbox.exec(`mkdir -p "${segmentDir}"`, workDir, EXEC_TIMEOUT_MS);

      // Check for API key in the host process environment
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          error:
            "ELEVENLABS_API_KEY not set. Skipping audio synthesis — the silent video and VTT are still usable.",
        };
      }

      // Dynamically import AI SDK + ElevenLabs
      const { experimental_generateSpeech: generateSpeech } =
        await import("ai");
      const { createElevenLabs } = await import("@ai-sdk/elevenlabs");
      const elevenlabs = createElevenLabs({ apiKey });

      const segments: string[] = [];

      for (const cue of cues) {
        if (abortSignal?.aborted) {
          return { success: false, error: "Aborted" };
        }

        const segmentPath = `${segmentDir}/cue_${String(cue.index).padStart(3, "0")}.mp3`;

        const result = await generateSpeech({
          model: elevenlabs.speech("eleven_turbo_v2_5"),
          text: cue.text,
        });

        // Write binary audio to sandbox via base64
        const base64 =
          typeof result.audio.base64 === "string"
            ? result.audio.base64
            : Buffer.from(result.audio.uint8Array).toString("base64");

        // Write in chunks to avoid shell argument limits
        const chunkSize = 60_000;
        if (base64.length <= chunkSize) {
          await sandbox.exec(
            `echo '${base64}' | base64 -d > '${segmentPath}'`,
            workDir,
            EXEC_TIMEOUT_MS,
          );
        } else {
          // For large audio, write base64 to a temp file first
          const tmpB64 = `${segmentPath}.b64`;
          await sandbox.writeFile(tmpB64, base64, "utf-8");
          await sandbox.exec(
            `base64 -d '${tmpB64}' > '${segmentPath}' && rm -f '${tmpB64}'`,
            workDir,
            EXEC_TIMEOUT_MS,
          );
        }

        segments.push(segmentPath);
      }

      return {
        success: true,
        segments,
        cueCount: cues.length,
        segmentDir,
      };
    },
  });

// ---------------------------------------------------------------------------
// upload_blob
// ---------------------------------------------------------------------------

const uploadInputSchema = z.object({
  filePath: z.string().describe("Path to the file in the sandbox to upload"),
  filename: z
    .string()
    .optional()
    .describe("Filename for the blob (defaults to basename of filePath)"),
  contentType: z
    .string()
    .optional()
    .describe("MIME type (default: auto-detected from extension)"),
  validateVideo: z
    .boolean()
    .optional()
    .describe(
      "When true, verify that uploaded video has a real video stream, duration, and non-trivial size before upload",
    ),
});

const CONTENT_TYPES: Record<string, string> = {
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".vtt": "text/vtt",
  ".mp3": "audio/mpeg",
  ".json": "application/json",
};

export const uploadBlobTool = () =>
  tool({
    description:
      "Upload a file from the sandbox to Vercel Blob storage. " +
      "Returns the public URL. Requires BLOB_READ_WRITE_TOKEN environment variable.",
    inputSchema: uploadInputSchema,
    execute: async (
      { filePath, filename, contentType, validateVideo },
      { experimental_context },
    ) => {
      const sandbox = await getSandbox(experimental_context, "upload");
      const workDir = sandbox.workingDirectory;

      const shouldValidateVideo =
        validateVideo ?? /\.(webm|mp4)$/i.test(filePath);
      if (shouldValidateVideo) {
        const probe = await probeVideo(sandbox, filePath);
        if (!probe.success) {
          return {
            success: false,
            error: probe.error ?? `Video validation failed for: ${filePath}`,
            validation: probe,
          };
        }
      }

      // Read file from sandbox as base64
      const result = await sandbox.exec(
        `base64 -w0 '${filePath}'`,
        workDir,
        EXEC_TIMEOUT_MS,
      );
      if (!result.success || !result.stdout) {
        return { success: false, error: `Failed to read file: ${filePath}` };
      }

      const buffer = Buffer.from(result.stdout.trim(), "base64");
      const sourceBasename = basename(filePath) || "file";
      const blobFilename = filename ?? sourceBasename;
      const ext = "." + blobFilename.split(".").pop();
      const mimeType =
        contentType ?? CONTENT_TYPES[ext] ?? "application/octet-stream";

      // Check for blob token in the host process environment
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) {
        return {
          success: false,
          error:
            "BLOB_READ_WRITE_TOKEN not set. Cannot upload — the local file path is still usable.",
        };
      }

      // Dynamic import to avoid hard dependency at module load time
      let put: typeof import("@vercel/blob").put;
      try {
        const blob = await import("@vercel/blob");
        put = blob.put;
      } catch {
        return {
          success: false,
          error: "@vercel/blob is not installed. Run: bun add @vercel/blob",
        };
      }

      try {
        const blob = await put(blobFilename, buffer, {
          access: "public",
          contentType: mimeType,
          token,
        });

        return {
          success: true,
          url: blob.url,
          filename: blobFilename,
          size: buffer.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Blob upload failed: ${message}` };
      }
    },
  });
