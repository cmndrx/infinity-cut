import {createReadStream, createWriteStream} from "node:fs";
import {mkdir, readdir, rm, stat, unlink} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import {spawn} from "node:child_process";
import {bundle} from "@remotion/bundler";
import {makeCancelSignal, renderFrames, renderMedia, selectComposition, type AudioCodec, type Codec, type PixelFormat} from "@remotion/renderer";
import type {Connect, Plugin} from "vite";
import {PersistentExportQueue, type StoredExportJob} from "./server/export-queue";
import {writeStoredZip} from "./server/zip";
import type {EditorProject} from "./src/editor/types";
import {buildProjectAudioMix} from "./src/editor/audio/project-audio";
import {buildFfmpegAudioGraph} from "./src/editor/audio/ffmpeg-filter-graph";

export type RenderFormat = "mp4" | "webm" | "hevc" | "prores" | "png-sequence" | "jpeg-sequence" | "wav" | "audio-stems";
export type RenderQuality = "draft" | "standard" | "high";
type RenderResolution = "source" | "720p";
type RenderRequest = {
  project: EditorProject;
  format?: RenderFormat;
  quality?: RenderQuality;
  resolution?: RenderResolution;
  frameRange?: [number, number] | null;
};

export type RenderEncoding = {
  codec: Codec;
  extension: "mp4" | "webm" | "mov";
  audioCodec: AudioCodec;
  crf: number | null;
  pixelFormat: PixelFormat;
  proResProfile?: "proxy" | "standard" | "hq";
  label: string;
};

export const resolveRenderEncoding = (format: RenderFormat | undefined, quality: RenderQuality): RenderEncoding => {
  if (format === "webm") return {codec: "vp9", extension: "webm", audioCodec: "opus", crf: quality === "draft" ? 34 : quality === "high" ? 18 : 24, pixelFormat: "yuv420p", label: "VP9 + Opus"};
  if (format === "hevc") return {codec: "h265", extension: "mp4", audioCodec: "aac", crf: quality === "draft" ? 30 : quality === "high" ? 18 : 23, pixelFormat: "yuv420p", label: "HEVC + AAC"};
  if (format === "prores") return {codec: "prores", extension: "mov", audioCodec: "pcm-16", crf: null, pixelFormat: "yuv422p10le", proResProfile: quality === "draft" ? "proxy" : quality === "high" ? "hq" : "standard", label: `ProRes ${quality === "draft" ? "Proxy" : quality === "high" ? "422 HQ" : "422"} + PCM`};
  return {codec: "h264", extension: "mp4", audioCodec: "aac", crf: quality === "draft" ? 28 : quality === "high" ? 16 : 20, pixelFormat: "yuv420p", label: "H.264 + AAC"};
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
    ".zip": "application/zip",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
};

const publicJob = (job: StoredExportJob<RenderRequest>) => ({
  id: job.id,
  stage: job.stage,
  progress: job.progress,
  message: job.message,
  filename: job.filename,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  attempts: job.attempts,
  sizeBytes: job.sizeBytes,
  error: job.error,
  downloadUrl: job.stage === "complete" ? `/api/render/${job.id}/download` : undefined,
});

export const directorsCutProRenderPlugin = (): Plugin => {
  let bundlePromise: Promise<string> | null = null;

  const install = (middlewares: Connect.Server, root: string) => {
    const dataDir = path.join(root, ".infinity-cut");
    const mediaDir = path.join(dataDir, "media");
    const renderDir = path.join(dataDir, "renders");
    const mediaSourcePath = (src: string) => {
      const local = src.match(/^\/api\/media\/([a-f0-9-]+)\/([^/?#]+)/i);
      if (local) return path.join(mediaDir, `${local[1]}-${safeFilename(decodeURIComponent(local[2]))}`);
      if (/^https?:\/\//i.test(src) || path.isAbsolute(src)) return src;
      return path.join(root, "public", src.replace(/^\/+/, ""));
    };
    const runFfmpeg = (args: string[], signal: AbortSignal) => new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", args, {stdio: ["ignore", "ignore", "pipe"]});
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-8_000); });
      const abort = () => child.kill("SIGTERM");
      signal.addEventListener("abort", abort, {once: true});
      child.once("error", reject);
      child.once("exit", (code) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(new Error("Export cancelled"));
        else if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
      });
    });
    const hasAudioStream = (source: string, signal: AbortSignal) => new Promise<boolean>((resolve) => {
      const child = spawn("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", source], {stdio: ["ignore", "pipe", "ignore"]});
      let output = "";
      child.stdout.on("data", (chunk) => { output += String(chunk); });
      const abort = () => child.kill("SIGTERM");
      signal.addEventListener("abort", abort, {once: true});
      child.once("error", () => resolve(false));
      child.once("exit", () => { signal.removeEventListener("abort", abort); resolve(Boolean(output.trim())); });
    });
    const renderProfessionalAudio = async (options: {project: EditorProject; output: string; frameRange: [number, number] | null; signal: AbortSignal; videoInput?: string; audioCodec: "aac" | "libopus" | "pcm_s16le" | "pcm_s24le"}) => {
      const candidates = options.project.clips.filter((clip) => clip.src && (clip.kind === "audio" || clip.kind === "video"));
      const checks = await Promise.all(candidates.map(async (clip) => ({clip, audible: await hasAudioStream(mediaSourcePath(clip.src!), options.signal)})));
      const clips = checks.filter((item) => item.audible).map((item) => item.clip);
      const firstAudioIndex = options.videoInput ? 1 : 0;
      const inputIndex = new Map(clips.map((clip, index) => [clip.id, firstAudioIndex + index]));
      const mix = buildProjectAudioMix(options.project, (clipId) => inputIndex.has(clipId) ? {inputIndex: inputIndex.get(clipId)!} : undefined);
      const graph = buildFfmpegAudioGraph(mix);
      const args = ["-hide_banner", "-loglevel", "error", "-y"];
      if (options.videoInput) args.push("-i", options.videoInput);
      for (const clip of clips) args.push("-i", mediaSourcePath(clip.src!));
      args.push("-filter_complex", graph.filterComplex);
      if (options.videoInput) args.push("-map", "0:v:0", "-c:v", "copy");
      args.push("-map", `[${graph.outputLabel}]`, "-c:a", options.audioCodec);
      if (options.audioCodec === "aac") args.push("-b:a", "320k");
      if (options.audioCodec === "libopus") args.push("-b:a", "256k");
      if (options.frameRange) {
        args.push("-ss", String(options.frameRange[0] / options.project.fps));
        args.push("-t", String((options.frameRange[1] - options.frameRange[0] + 1) / options.project.fps));
      }
      args.push(options.output);
      await runFfmpeg(args, options.signal);
    };
    const queue = new PersistentExportQueue<RenderRequest>(path.join(dataDir, "render-queue.json"), async (job, controls) => {
      const request = job.request;
      const {project} = request;
      const format: RenderFormat = ["webm", "hevc", "prores", "png-sequence", "jpeg-sequence", "wav", "audio-stems"].includes(request.format ?? "") ? request.format! : "mp4";
      const quality: RenderQuality = ["draft", "standard", "high"].includes(request.quality ?? "") ? request.quality! : "standard";
      const resolution: RenderResolution = request.resolution === "720p" ? "720p" : "source";
      const scale = resolution === "720p" ? Math.min(1, 720 / project.height) : 1;
      const {cancelSignal, cancel} = makeCancelSignal();
      controls.signal.addEventListener("abort", cancel, {once: true});
      let frameDirectory: string | null = null;
      let videoTemp: string | null = null;

      try {
        await mkdir(renderDir, {recursive: true});
        await controls.setState({stage: "bundling", message: "Preparing the Remotion renderer", progress: 2});
        if (!bundlePromise) {
          bundlePromise = bundle({
            entryPoint: path.join(root, "src/index.ts"),
            publicDir: path.join(root, "public"),
            onProgress: (value) => {
              const normalized = value > 1 ? value / 100 : value;
              void controls.setState({progress: Math.max(job.progress, Math.round(normalized * 8))});
            },
          }).catch((error) => {
            bundlePromise = null;
            throw error;
          });
        }
        const serveUrl = await bundlePromise;
        if (controls.signal.aborted) throw new Error("Export cancelled");

        const inputProps = {project};
        const composition = await selectComposition({
          serveUrl,
          id: "DirectorsCutProExport",
          inputProps,
          logLevel: "warn",
        });

        await controls.setState({stage: "rendering", message: format.endsWith("sequence") ? "Rendering image sequence" : format === "audio-stems" ? "Rendering audio stems" : format === "wav" ? "Rendering lossless audio mix" : "Rendering frames and mixing audio", progress: 10});
        const frameRange = request.frameRange && request.frameRange.length === 2
          ? [Math.max(0, Math.round(request.frameRange[0])), Math.min(project.durationInFrames - 1, Math.round(request.frameRange[1]))] as [number, number]
          : null;

        if (format === "png-sequence" || format === "jpeg-sequence") {
          frameDirectory = path.join(renderDir, `.frames-${job.id}`);
          await mkdir(frameDirectory, {recursive: true});
          const imageFormat = format === "png-sequence" ? "png" : "jpeg";
          await renderFrames({
            composition, serveUrl, inputProps, outputDir: frameDirectory, frameRange, scale, imageFormat,
            imageSequencePattern: `frame-[frame].${imageFormat === "jpeg" ? "jpg" : "png"}`,
            jpegQuality: quality === "draft" ? 72 : quality === "high" ? 95 : 86,
            cancelSignal, logLevel: "warn", onStart: () => undefined,
            onFrameUpdate: (framesRendered) => {
              const total = frameRange ? frameRange[1] - frameRange[0] + 1 : project.durationInFrames;
              void controls.setState({progress: Math.max(10, Math.min(90, Math.round(10 + (framesRendered / total) * 80)))});
            },
          });
          await controls.setState({stage: "packaging", message: "Packaging image sequence", progress: 92});
          const names = (await readdir(frameDirectory)).filter((name) => name.endsWith(imageFormat === "jpeg" ? ".jpg" : ".png")).sort();
          if (!names.length) throw new Error("The renderer did not produce any image frames");
          const sizeBytes = await writeStoredZip(job.outputPath, names.map((name) => ({path: path.join(frameDirectory!, name), name})));
          return {sizeBytes};
        } else if (format === "wav") {
          await renderProfessionalAudio({project, output: job.outputPath, frameRange, signal: controls.signal, audioCodec: "pcm_s24le"});
          return {sizeBytes: (await stat(job.outputPath)).size};
        } else if (format === "audio-stems") {
          frameDirectory = path.join(renderDir, `.stems-${job.id}`);
          await mkdir(frameDirectory, {recursive: true});
          const audioTracks = project.tracks.filter((track) => track.kind === "audio");
          if (!audioTracks.length) throw new Error("This project has no audio tracks to export as stems");
          const files: {path: string; name: string}[] = [];
          for (let index = 0; index < audioTracks.length; index++) {
            if (controls.signal.aborted) throw new Error("Export cancelled");
            const selected = audioTracks[index];
            const stemProject = {...project, tracks: project.tracks.map((track) => ({...track, muted: track.id !== selected.id, solo: false}))};
            const stemName = `${String(index + 1).padStart(2, "0")}-${safeFilename(selected.name)}.wav`;
            const stemPath = path.join(frameDirectory, stemName);
            await renderProfessionalAudio({project: stemProject, output: stemPath, frameRange, signal: controls.signal, audioCodec: "pcm_s24le"});
            await controls.setState({progress: Math.round(10 + ((index + 1) / audioTracks.length) * 80)});
            files.push({path: stemPath, name: stemName});
          }
          await controls.setState({stage: "packaging", message: "Packaging audio stems", progress: 92});
          return {sizeBytes: await writeStoredZip(job.outputPath, files)};
        } else {
          const encoding = resolveRenderEncoding(format, quality);
          videoTemp = path.join(renderDir, `.silent-${job.id}.${encoding.extension}`);
          const silentProject = {...project, tracks: project.tracks.map((track) => ({...track, muted: true, solo: false})), clips: project.clips.map((clip) => ({...clip, audioMuted: true}))};
          await renderMedia({
            codec: encoding.codec, composition, serveUrl, inputProps: {project: silentProject}, outputLocation: videoTemp, overwrite: true,
            crf: encoding.crf, scale, frameRange: null, imageFormat: "jpeg", jpegQuality: quality === "draft" ? 72 : quality === "high" ? 95 : 86,
            audioCodec: encoding.audioCodec, audioBitrate: format === "prores" ? undefined : quality === "draft" ? "128k" : quality === "high" ? "320k" : "192k",
            pixelFormat: encoding.pixelFormat, proResProfile: encoding.proResProfile, preferLossless: format === "prores",
            x264Preset: encoding.codec === "h264" ? "veryfast" : undefined,
            hardwareAcceleration: encoding.codec === "h264" || encoding.codec === "h265" ? "if-possible" : "disable",
            cancelSignal, logLevel: "warn",
            onProgress: ({progress}) => void controls.setState({progress: Math.max(10, Math.min(78, Math.round(10 + progress * 68)))}),
          });
          await controls.setState({stage: "packaging", message: "Applying mixer, buses, and processor rack", progress: 80});
          await renderProfessionalAudio({project, output: job.outputPath, frameRange, signal: controls.signal, videoInput: videoTemp, audioCodec: format === "webm" ? "libopus" : format === "prores" ? "pcm_s16le" : "aac"});
          return {sizeBytes: (await stat(job.outputPath)).size};
        }
      } finally {
        if (frameDirectory) await rm(frameDirectory, {recursive: true, force: true});
        if (videoTemp) await rm(videoTemp, {force: true});
      }
    }, renderDir);
    const queueReady = queue.initialize();

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

      await queueReady;

      if (request.method === "GET" && url.pathname === "/api/export/capabilities") {
        return sendJson(response, 200, {
          queue: {persistent: true, concurrency: 1},
          formats: [
            {id: "mp4", available: true, label: "H.264 MP4"},
            {id: "webm", available: true, label: "VP9 WebM"},
            {id: "hevc", available: true, label: "HEVC H.265"},
            {id: "prores", available: true, label: "Apple ProRes"},
            {id: "png-sequence", available: true, label: "PNG image sequence ZIP"},
            {id: "jpeg-sequence", available: true, label: "JPEG image sequence ZIP"},
          ],
          interchange: [
            {id: "cmx3600", available: true, label: "CMX 3600 EDL"},
            {id: "fcp7-xml", available: true, label: "Final Cut Pro 7 XML"},
            {id: "aaf", available: false, label: "AAF", reason: "No proven AAF authoring library is installed. AAF is disabled to avoid generating invalid interchange files."},
          ],
          audio: [
            {id: "wav", available: true, label: "Lossless WAV mix"},
            {id: "audio-stems", available: true, label: "Per-track WAV stems ZIP"},
          ],
        });
      }

      if (request.method === "GET" && url.pathname === "/api/render") {
        return sendJson(response, 200, queue.list().map(publicJob));
      }

      if (request.method === "POST" && url.pathname === "/api/render") {
        try {
          const body = await readJson(request);
          if (!body.project || !Array.isArray(body.project.clips) || !Array.isArray(body.project.tracks) || body.project.durationInFrames < 1) {
            return sendJson(response, 400, {error: "Invalid Directors Cut Pro project"});
          }
          const id = randomUUID();
          const format: RenderFormat = ["webm", "hevc", "prores", "png-sequence", "jpeg-sequence", "wav", "audio-stems"].includes(body.format ?? "") ? body.format! : "mp4";
          const quality: RenderQuality = ["draft", "standard", "high"].includes(body.quality ?? "") ? body.quality! : "standard";
          const extension = format === "png-sequence" || format === "jpeg-sequence" || format === "audio-stems" ? "zip" : format === "wav" ? "wav" : resolveRenderEncoding(format, quality).extension;
          const baseName = safeFilename(body.project.name.toLowerCase()) || "directors-cut-pro-export";
          const filename = `${baseName}-${id.slice(0, 8)}.${extension}`;
          const now = Date.now();
          const job: StoredExportJob<RenderRequest> = {
            id,
            stage: "queued",
            progress: 0,
            message: "Export queued",
            filename,
            outputPath: path.join(renderDir, filename),
            createdAt: now,
            updatedAt: now,
            attempts: 0,
            request: {...body, format, quality},
          };
          await queue.add(job);
          return sendJson(response, 202, publicJob(job));
        } catch (error) {
          return sendJson(response, 400, {error: error instanceof Error ? error.message : "Invalid render request"});
        }
      }

      const renderMatch = url.pathname.match(/^\/api\/render\/([a-f0-9-]+)(?:\/(download|cancel|retry))?$/i);
      if (renderMatch) {
        const job = queue.get(renderMatch[1]);
        if (!job) return sendJson(response, 404, {error: "Render job not found"});
        if (request.method === "POST" && renderMatch[2] === "cancel") {
          const cancelled = await queue.cancel(job.id);
          return sendJson(response, 200, publicJob(cancelled!));
        }
        if (request.method === "POST" && renderMatch[2] === "retry") {
          const retried = await queue.retry(job.id);
          if (!retried) return sendJson(response, 409, {error: "Only cancelled or failed exports can be retried"});
          return sendJson(response, 202, publicJob(retried));
        }
        if (request.method === "DELETE" && !renderMatch[2]) {
          if (["queued", "bundling", "rendering", "packaging"].includes(job.stage)) {
            const cancelled = await queue.cancel(job.id);
            return sendJson(response, 200, publicJob(cancelled!));
          }
          if (!(await queue.remove(job.id))) return sendJson(response, 409, {error: "Active exports must be cancelled before removal"});
          response.statusCode = 204;
          return response.end();
        }
        if (request.method === "GET" && renderMatch[2] === "download") {
          if (job.stage !== "complete") return sendJson(response, 409, {error: "Export is not ready"});
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
    name: "directors-cut-pro-render-service",
    configureServer(server) {
      install(server.middlewares, server.config.root);
    },
    configurePreviewServer(server) {
      install(server.middlewares, server.config.root);
    },
  };
};
