import {createReadStream, createWriteStream} from "node:fs";
import {mkdir, stat, unlink} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import {bundle} from "@remotion/bundler";
import {makeCancelSignal, renderMedia, selectComposition, type Codec} from "@remotion/renderer";
import type {Connect, Plugin} from "vite";
import type {EditorProject} from "./src/editor/types";

type RenderFormat = "mp4" | "webm";
type RenderQuality = "draft" | "standard" | "high";
type RenderResolution = "source" | "720p";
type RenderStage = "queued" | "bundling" | "rendering" | "complete" | "cancelled" | "error";

type RenderJob = {
  id: string;
  stage: RenderStage;
  progress: number;
  message: string;
  filename: string;
  outputPath: string;
  createdAt: number;
  sizeBytes?: number;
  error?: string;
  cancel?: () => void;
};

type RenderRequest = {
  project: EditorProject;
  format?: RenderFormat;
  quality?: RenderQuality;
  resolution?: RenderResolution;
  frameRange?: [number, number] | null;
};

const sendJson = (response: import("node:http").ServerResponse, status: number, value: unknown) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
};

const readJson = async (request: import("node:http").IncomingMessage) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 10 * 1024 * 1024) throw new Error("Render request exceeds the 10 MB limit");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as RenderRequest;
};

const safeFilename = (value: string) => value
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 120) || "media-file";

const contentTypeFor = (filename: string) => {
  const extension = path.extname(filename).toLowerCase();
  return ({
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
};

const publicJob = (job: RenderJob) => ({
  id: job.id,
  stage: job.stage,
  progress: job.progress,
  message: job.message,
  filename: job.filename,
  sizeBytes: job.sizeBytes,
  error: job.error,
  downloadUrl: job.stage === "complete" ? `/api/render/${job.id}/download` : undefined,
});

export const infinityCutRenderPlugin = (): Plugin => {
  const jobs = new Map<string, RenderJob>();
  let bundlePromise: Promise<string> | null = null;

  const install = (middlewares: Connect.Server, root: string) => {
    const dataDir = path.join(root, ".infinity-cut");
    const mediaDir = path.join(dataDir, "media");
    const renderDir = path.join(dataDir, "renders");

    const startRender = async (job: RenderJob, request: RenderRequest) => {
      const {project} = request;
      const format: RenderFormat = request.format === "webm" ? "webm" : "mp4";
      const quality: RenderQuality = ["draft", "standard", "high"].includes(request.quality ?? "") ? request.quality! : "standard";
      const resolution: RenderResolution = request.resolution === "720p" ? "720p" : "source";
      const codec: Codec = format === "webm" ? "vp9" : "h264";
      const crf = quality === "draft" ? 28 : quality === "high" ? 16 : 20;
      const scale = resolution === "720p" ? Math.min(1, 720 / project.height) : 1;
      const {cancelSignal, cancel} = makeCancelSignal();
      job.cancel = cancel;

      try {
        await mkdir(renderDir, {recursive: true});
        job.stage = "bundling";
        job.message = "Preparing the Remotion renderer";
        job.progress = 2;
        if (!bundlePromise) {
          bundlePromise = bundle({
            entryPoint: path.join(root, "src/index.ts"),
            publicDir: path.join(root, "public"),
            onProgress: (value) => {
              const normalized = value > 1 ? value / 100 : value;
              job.progress = Math.max(job.progress, Math.round(normalized * 8));
            },
          }).catch((error) => {
            bundlePromise = null;
            throw error;
          });
        }
        const serveUrl = await bundlePromise;
        if (jobs.get(job.id)?.stage === "cancelled") return;

        const inputProps = {project};
        const composition = await selectComposition({
          serveUrl,
          id: "InfinityCutExport",
          inputProps,
          logLevel: "warn",
        });

        job.stage = "rendering";
        job.message = "Rendering frames and mixing audio";
        job.progress = 10;
        const frameRange = request.frameRange && request.frameRange.length === 2
          ? [Math.max(0, Math.round(request.frameRange[0])), Math.min(project.durationInFrames - 1, Math.round(request.frameRange[1]))] as [number, number]
          : null;

        await renderMedia({
          codec,
          composition,
          serveUrl,
          inputProps,
          outputLocation: job.outputPath,
          overwrite: true,
          crf,
          scale,
          frameRange,
          imageFormat: "jpeg",
          jpegQuality: quality === "draft" ? 72 : quality === "high" ? 95 : 86,
          audioCodec: format === "webm" ? "opus" : "aac",
          audioBitrate: quality === "draft" ? "128k" : quality === "high" ? "320k" : "192k",
          pixelFormat: "yuv420p",
          x264Preset: format === "mp4" ? "veryfast" : undefined,
          cancelSignal,
          logLevel: "warn",
          onProgress: ({progress}) => {
            job.progress = Math.max(10, Math.min(99, Math.round(10 + progress * 89)));
          },
        });

        const output = await stat(job.outputPath);
        job.stage = "complete";
        job.progress = 100;
        job.message = "Video ready to download";
        job.sizeBytes = output.size;
        job.cancel = undefined;
      } catch (error) {
        if (job.stage === "cancelled" || (error instanceof Error && error.message.toLowerCase().includes("cancel"))) {
          job.stage = "cancelled";
          job.message = "Export cancelled";
          job.error = undefined;
        } else {
          job.stage = "error";
          job.message = "Export failed";
          job.error = error instanceof Error ? error.message : String(error);
        }
        job.cancel = undefined;
        await unlink(job.outputPath).catch(() => undefined);
      }
    };

    middlewares.use(async (request, response, next) => {
      if (!request.url) return next();
      const url = new URL(request.url, "http://localhost");

      if (request.method === "POST" && url.pathname === "/api/media") {
        const providedName = url.searchParams.get("name") ?? "media-file";
        const filename = safeFilename(providedName);
        const id = randomUUID();
        const filePath = path.join(mediaDir, `${id}-${filename}`);
        const declaredSize = Number(request.headers["content-length"] ?? 0);
        if (declaredSize > 4 * 1024 * 1024 * 1024) return sendJson(response, 413, {error: "Media files are limited to 4 GB"});
        try {
          await mkdir(mediaDir, {recursive: true});
          await pipeline(request, createWriteStream(filePath, {flags: "wx"}));
          response.setHeader("Access-Control-Allow-Origin", "*");
          return sendJson(response, 201, {url: `/api/media/${id}/${encodeURIComponent(filename)}`});
        } catch (error) {
          await unlink(filePath).catch(() => undefined);
          return sendJson(response, 500, {error: error instanceof Error ? error.message : "Media upload failed"});
        }
      }

      const mediaMatch = url.pathname.match(/^\/api\/media\/([a-f0-9-]+)\/([^/]+)$/i);
      if (request.method === "GET" && mediaMatch) {
        const filename = safeFilename(decodeURIComponent(mediaMatch[2]));
        const filePath = path.join(mediaDir, `${mediaMatch[1]}-${filename}`);
        try {
          const file = await stat(filePath);
          response.setHeader("Content-Type", contentTypeFor(filename));
          response.setHeader("Accept-Ranges", "bytes");
          response.setHeader("Access-Control-Allow-Origin", "*");
          response.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range");
          const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
          if (range) {
            const requestedStart = range[1] ? Number(range[1]) : 0;
            const requestedEnd = range[2] ? Number(range[2]) : file.size - 1;
            const start = Math.max(0, Math.min(file.size - 1, requestedStart));
            const end = Math.max(start, Math.min(file.size - 1, requestedEnd));
            response.statusCode = 206;
            response.setHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);
            response.setHeader("Content-Length", end - start + 1);
            createReadStream(filePath, {start, end}).pipe(response);
            return;
          }
          response.statusCode = 200;
          response.setHeader("Content-Length", file.size);
          createReadStream(filePath).pipe(response);
          return;
        } catch {
          return sendJson(response, 404, {error: "Media file not found"});
        }
      }

      if (request.method === "POST" && url.pathname === "/api/render") {
        try {
          const body = await readJson(request);
          if (!body.project || !Array.isArray(body.project.clips) || !Array.isArray(body.project.tracks) || body.project.durationInFrames < 1) {
            return sendJson(response, 400, {error: "Invalid Director Cut PRO project"});
          }
          const id = randomUUID();
          const format = body.format === "webm" ? "webm" : "mp4";
          const baseName = safeFilename(body.project.name.toLowerCase()) || "infinity-cut-export";
          const filename = `${baseName}-${id.slice(0, 8)}.${format}`;
          const job: RenderJob = {
            id,
            stage: "queued",
            progress: 0,
            message: "Export queued",
            filename,
            outputPath: path.join(renderDir, filename),
            createdAt: Date.now(),
          };
          jobs.set(id, job);
          void startRender(job, body);
          return sendJson(response, 202, publicJob(job));
        } catch (error) {
          return sendJson(response, 400, {error: error instanceof Error ? error.message : "Invalid render request"});
        }
      }

      const renderMatch = url.pathname.match(/^\/api\/render\/([a-f0-9-]+)(?:\/(download))?$/i);
      if (renderMatch) {
        const job = jobs.get(renderMatch[1]);
        if (!job) return sendJson(response, 404, {error: "Render job not found"});
        if (request.method === "DELETE" && !renderMatch[2]) {
          if (["queued", "bundling", "rendering"].includes(job.stage)) {
            job.stage = "cancelled";
            job.message = "Cancelling export";
            job.cancel?.();
          }
          return sendJson(response, 200, publicJob(job));
        }
        if (request.method === "GET" && renderMatch[2] === "download") {
          if (job.stage !== "complete") return sendJson(response, 409, {error: "Video is not ready"});
          const file = await stat(job.outputPath).catch(() => null);
          if (!file) return sendJson(response, 404, {error: "Rendered video not found"});
          response.statusCode = 200;
          response.setHeader("Content-Type", contentTypeFor(job.filename));
          response.setHeader("Content-Length", file.size);
          response.setHeader("Content-Disposition", `attachment; filename="${job.filename}"`);
          createReadStream(job.outputPath).pipe(response);
          return;
        }
        if (request.method === "GET" && !renderMatch[2]) return sendJson(response, 200, publicJob(job));
      }

      next();
    });
  };

  return {
    name: "infinity-cut-render-service",
    configureServer(server) {
      install(server.middlewares, server.config.root);
    },
    configurePreviewServer(server) {
      install(server.middlewares, server.config.root);
    },
  };
};
