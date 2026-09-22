import {createReadStream, createWriteStream} from "node:fs";
import {mkdir, readdir, rm, stat, unlink} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import {bundle} from "@remotion/bundler";
import {makeCancelSignal, renderFrames, renderMedia, selectComposition, type AudioCodec, type Codec, type PixelFormat} from "@remotion/renderer";
import type {Connect, Plugin} from "vite";
import {PersistentExportQueue, type StoredExportJob} from "./server/export-queue";
import {writeStoredZip} from "./server/zip";
import {ProxyManager} from "./server/proxy-manager";
import {MediaAnalysisManager, type AnalysisKind} from "./server/media-analysis-manager";
import {RenderCacheManager} from "./server/render-cache-manager";
import {resolveMediaSourcePath, safeMediaFilename} from "./server/media-source";
import {assertSupportedNestedAudio, createProjectAudioRenderer} from "./server/project-audio-renderer";
import type {EditorProject} from "./src/editor/types";

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

const readSmallJson = async <T,>(request: import("node:http").IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 32 * 1024) throw new Error("Request exceeds the 32 KB limit");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
};

const safeFilename = safeMediaFilename;

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
    const proxyDir = path.join(dataDir, "proxies");
    const analysisDir = path.join(dataDir, "analysis");
    const cacheDir = path.join(dataDir, "render-cache");
    const renderDir = path.join(dataDir, "renders");
    const mediaSourcePath = (src: string) => resolveMediaSourcePath(src, root, mediaDir);
    const proxySourcePath = (src: string) => {
      if (src.match(/^\/api\/media\/[a-f0-9-]+\/[^/?#]+$/i)) return mediaSourcePath(src);
      if (/^https?:\/\//i.test(src) || path.isAbsolute(src) && !src.startsWith("/")) throw new Error("Only locally staged media can be proxied");
      const publicRoot = path.resolve(root, "public");
      const resolved = path.resolve(publicRoot, src.replace(/^\/+/, ""));
      if (resolved !== publicRoot && !resolved.startsWith(`${publicRoot}${path.sep}`)) throw new Error("Proxy source escapes the public media directory");
      return resolved;
    };
    const proxyManager = new ProxyManager(proxyDir, proxySourcePath);
    const analysisManager = new MediaAnalysisManager(analysisDir, proxySourcePath);
    const renderCacheManager = new RenderCacheManager(cacheDir, async (project, output) => {
      if (!bundlePromise) {
        bundlePromise = bundle({entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public")}).catch((error) => {
          bundlePromise = null;
          throw error;
        });
      }
      const serveUrl = await bundlePromise;
      const silentProject = {...project, renderCache: undefined, tracks: project.tracks.map((track) => ({...track, muted: true, solo: false})), clips: project.clips.map((clip) => ({...clip, audioMuted: true}))};
      const inputProps = {project: silentProject};
      const composition = await selectComposition({serveUrl, id: "DirectorsCutProExport", inputProps, logLevel: "warn"});
      await renderMedia({
        codec: "h264", composition, serveUrl, inputProps, outputLocation: output, overwrite: true,
        crf: 24, scale: Math.min(1, 1280 / project.width), imageFormat: "jpeg", jpegQuality: 82,
        audioCodec: "aac", audioBitrate: "128k", pixelFormat: "yuv420p", x264Preset: "veryfast",
        hardwareAcceleration: "if-possible", logLevel: "warn",
      });
    });
    const renderProfessionalAudio = createProjectAudioRenderer(mediaSourcePath);
    const queue = new PersistentExportQueue<RenderRequest>(path.join(dataDir, "render-queue.json"), async (job, controls) => {
      const request = job.request;
      const {project} = request;
      assertSupportedNestedAudio(project);
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

      if (request.method === "POST" && url.pathname === "/api/proxies") {
        try {
          const body = await readSmallJson<{src?: unknown}>(request);
          if (typeof body.src !== "string" || !body.src.trim()) return sendJson(response, 400, {error: "A local media source is required"});
          return sendJson(response, 202, await proxyManager.start(body.src));
        } catch (error) {
          return sendJson(response, 400, {error: error instanceof Error ? error.message : "Proxy request failed"});
        }
      }

      if (request.method === "POST" && url.pathname === "/api/media-analysis") {
        try {
          const body = await readSmallJson<{src?: unknown; kind?: unknown}>(request);
          if (typeof body.src !== "string" || !body.src.trim()) return sendJson(response, 400, {error: "A local media source is required"});
          if (!(["video", "audio", "image"] as unknown[]).includes(body.kind)) return sendJson(response, 400, {error: "Media kind must be video, audio, or image"});
          return sendJson(response, 202, await analysisManager.start(body.src, body.kind as AnalysisKind));
        } catch (error) {
          return sendJson(response, 400, {error: error instanceof Error ? error.message : "Media analysis request failed"});
        }
      }

      const analysisMatch = url.pathname.match(/^\/api\/media-analysis\/([a-f0-9]{24})(?:\/thumbnail\.jpg)?$/i);
      if (analysisMatch) {
        if (request.method === "DELETE" && !url.pathname.endsWith("/thumbnail.jpg")) {
          await analysisManager.remove(analysisMatch[1]);
          response.statusCode = 204;
          return response.end();
        }
        if (request.method === "GET" && url.pathname.endsWith("/thumbnail.jpg")) {
          const status = await analysisManager.status(analysisMatch[1]);
          if (status?.status !== "ready" || !status.thumbnailUrl) return sendJson(response, 404, {error: "Thumbnail is not ready"});
          const filePath = analysisManager.thumbnailPath(analysisMatch[1]);
          const file = await stat(filePath).catch(() => null);
          if (!file) return sendJson(response, 404, {error: "Thumbnail was not found"});
          response.statusCode = 200;
          response.setHeader("Content-Type", "image/jpeg");
          response.setHeader("Content-Length", file.size);
          response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
          createReadStream(filePath).pipe(response);
          return;
        }
        if (request.method === "GET") {
          const status = await analysisManager.status(analysisMatch[1]);
          return status ? sendJson(response, 200, status) : sendJson(response, 404, {error: "Media analysis job not found"});
        }
      }

      if (request.method === "POST" && url.pathname === "/api/render-cache") {
        try {
          const body = await readJson(request);
          if (!body.project || !Array.isArray(body.project.clips) || !Array.isArray(body.project.tracks)) return sendJson(response, 400, {error: "A valid project is required"});
          return sendJson(response, 202, await renderCacheManager.start(body.project));
        } catch (error) {
          return sendJson(response, 400, {error: error instanceof Error ? error.message : "Timeline cache request failed"});
        }
      }

      const cacheMatch = url.pathname.match(/^\/api\/render-cache\/(cache-[a-f0-9]{8})(?:\/preview\.mp4)?$/i);
      if (cacheMatch) {
        if (request.method === "DELETE" && !url.pathname.endsWith("/preview.mp4")) {
          await renderCacheManager.remove(cacheMatch[1]);
          response.statusCode = 204;
          return response.end();
        }
        if (request.method === "GET" && url.pathname.endsWith("/preview.mp4")) {
          const status = await renderCacheManager.status(cacheMatch[1]);
          if (status?.status !== "ready") return sendJson(response, 404, {error: "Timeline cache is not ready"});
          const filePath = renderCacheManager.outputPath(cacheMatch[1]);
          const file = await stat(filePath).catch(() => null);
          if (!file) return sendJson(response, 404, {error: "Timeline cache was not found"});
          response.statusCode = 200;
          response.setHeader("Content-Type", "video/mp4");
          response.setHeader("Accept-Ranges", "bytes");
          response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
          const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
          if (range) {
            const start = Math.max(0, Math.min(file.size - 1, range[1] ? Number(range[1]) : 0));
            const end = Math.max(start, Math.min(file.size - 1, range[2] ? Number(range[2]) : file.size - 1));
            response.statusCode = 206;
            response.setHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);
            response.setHeader("Content-Length", end - start + 1);
            createReadStream(filePath, {start, end}).pipe(response);
            return;
          }
          response.setHeader("Content-Length", file.size);
          createReadStream(filePath).pipe(response);
          return;
        }
        if (request.method === "GET") {
          const status = await renderCacheManager.status(cacheMatch[1]);
          return status ? sendJson(response, 200, status) : sendJson(response, 404, {error: "Timeline cache job not found"});
        }
      }

      const proxyMatch = url.pathname.match(/^\/api\/proxies\/([a-f0-9]{24})(?:\/proxy\.mp4)?$/i);
      if (proxyMatch) {
        if (request.method === "DELETE") {
          await proxyManager.remove(proxyMatch[1]);
          response.statusCode = 204;
          return response.end();
        }
        if (request.method === "GET" && url.pathname.endsWith("/proxy.mp4")) {
          const status = await proxyManager.status(proxyMatch[1]);
          if (status?.status !== "ready") return sendJson(response, 404, {error: "Proxy media is not ready"});
          const filePath = path.join(proxyDir, `${proxyMatch[1]}.mp4`);
          const file = await stat(filePath).catch(() => null);
          if (!file) return sendJson(response, 404, {error: "Proxy media was not found"});
          response.statusCode = 200;
          response.setHeader("Content-Type", "video/mp4");
          response.setHeader("Accept-Ranges", "bytes");
          response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
          const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
          if (range) {
            const start = Math.max(0, Math.min(file.size - 1, range[1] ? Number(range[1]) : 0));
            const end = Math.max(start, Math.min(file.size - 1, range[2] ? Number(range[2]) : file.size - 1));
            response.statusCode = 206;
            response.setHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);
            response.setHeader("Content-Length", end - start + 1);
            createReadStream(filePath, {start, end}).pipe(response);
            return;
          }
          response.setHeader("Content-Length", file.size);
          createReadStream(filePath).pipe(response);
          return;
        }
        if (request.method === "GET") {
          const status = await proxyManager.status(proxyMatch[1]);
          return status ? sendJson(response, 200, status) : sendJson(response, 404, {error: "Proxy job not found"});
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
