import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";

export type AnalysisKind = "video" | "audio" | "image";
export type MediaAnalysisStatus = {
  id: string;
  status: "queued" | "processing" | "ready" | "error";
  thumbnailUrl?: string;
  waveform?: number[];
  generatedAt?: number;
  error?: string;
};

export const analysisIdForSource = (src: string) => createHash("sha256").update(`analysis-v1:${src}`).digest("hex").slice(0, 24);

export const buildThumbnailArgs = (source: string, output: string, kind: AnalysisKind) => [
  "-hide_banner", "-loglevel", "error", "-y",
  ...(kind === "video" ? ["-ss", "0.25"] : []),
  "-i", source, "-map", "0:v:0", "-frames:v", "1",
  "-vf", "scale=w='min(640,iw)':h=-2:force_original_aspect_ratio=decrease,setsar=1",
  "-q:v", "4", output,
];

export const buildWaveformArgs = (source: string) => [
  "-hide_banner", "-loglevel", "error", "-i", source, "-map", "0:a:0",
  "-vn", "-ac", "1", "-ar", "2000", "-t", "7200", "-f", "s16le", "pipe:1",
];

export const peaksFromPcm16 = (pcm: Buffer, peakCount = 512) => {
  const samples = Math.floor(pcm.length / 2);
  if (!samples) return [];
  return Array.from({length: Math.min(peakCount, samples)}, (_, index) => {
    const from = Math.floor((index / peakCount) * samples);
    const to = Math.max(from + 1, Math.floor(((index + 1) / peakCount) * samples));
    let peak = 0;
    for (let cursor = from; cursor < Math.min(samples, to); cursor++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(cursor * 2)) / 32768);
    return Math.round(peak * 10_000) / 10_000;
  });
};

const run = (args: string[], collectStdout = false) => new Promise<Buffer>((resolve, reject) => {
  const child = spawn("ffmpeg", args, {stdio: ["ignore", collectStdout ? "pipe" : "ignore", "pipe"]});
  const chunks: Buffer[] = [];
  let size = 0;
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size <= 64 * 1024 * 1024) chunks.push(chunk);
    else child.kill("SIGTERM");
  });
  child.stderr?.on("data", (chunk) => {stderr = `${stderr}${String(chunk)}`.slice(-4_000);});
  child.once("error", reject);
  child.once("exit", (code) => code === 0 && size <= 64 * 1024 * 1024 ? resolve(Buffer.concat(chunks)) : reject(new Error(size > 64 * 1024 * 1024 ? "Audio analysis exceeded its safe memory limit" : stderr.trim() || `FFmpeg exited with code ${code}`)));
});

export class MediaAnalysisManager {
  private readonly jobs = new Map<string, MediaAnalysisStatus>();
  private readonly cancelled = new Set<string>();

  constructor(private readonly analysisDir: string, private readonly resolveSource: (src: string) => string) {}

  private metadataPath(id: string) { return path.join(this.analysisDir, `${id}.json`); }
  thumbnailPath(id: string) { return path.join(this.analysisDir, `${id}.jpg`); }

  private publicStatus(status: MediaAnalysisStatus): MediaAnalysisStatus {
    return {...status, thumbnailUrl: status.thumbnailUrl ? `/api/media-analysis/${status.id}/thumbnail.jpg` : undefined};
  }

  async status(id: string): Promise<MediaAnalysisStatus | null> {
    if (!/^[a-f0-9]{24}$/.test(id)) return null;
    const active = this.jobs.get(id);
    if (active) return this.publicStatus(active);
    try {
      const stored = JSON.parse(await readFile(this.metadataPath(id), "utf8")) as MediaAnalysisStatus;
      return this.publicStatus(stored);
    } catch {
      return null;
    }
  }

  async start(src: string, kind: AnalysisKind) {
    const id = analysisIdForSource(src);
    const existing = await this.status(id);
    if (existing) return existing;
    const source = this.resolveSource(src);
    if (/^https?:\/\//i.test(source)) throw new Error("Remote media must be staged locally before analysis");
    const file = await stat(source).catch(() => null);
    if (!file?.isFile()) throw new Error("Original media is unavailable for analysis");
    await mkdir(this.analysisDir, {recursive: true});
    const queued: MediaAnalysisStatus = {id, status: "queued"};
    this.cancelled.delete(id);
    this.jobs.set(id, queued);
    queueMicrotask(() => void this.generate(id, source, kind));
    return queued;
  }

  private async generate(id: string, source: string, kind: AnalysisKind) {
    this.jobs.set(id, {id, status: "processing"});
    const thumbnailTemp = path.join(this.analysisDir, `.${id}-${Date.now()}.jpg`);
    const metadataTemp = path.join(this.analysisDir, `.${id}-${Date.now()}.json`);
    try {
      let thumbnailUrl: string | undefined;
      let waveform: number[] | undefined;
      if (kind !== "audio") {
        await run(buildThumbnailArgs(source, thumbnailTemp, kind));
        if (this.cancelled.has(id)) throw new Error("Media analysis cancelled");
        await rename(thumbnailTemp, this.thumbnailPath(id));
        thumbnailUrl = "stored";
      }
      if (kind !== "image") {
        try { waveform = peaksFromPcm16(await run(buildWaveformArgs(source), true)); } catch (error) {
          if (kind === "audio") throw error;
          waveform = [];
        }
      }
      if (this.cancelled.has(id)) throw new Error("Media analysis cancelled");
      const ready: MediaAnalysisStatus = {id, status: "ready", thumbnailUrl, waveform, generatedAt: Date.now()};
      await writeFile(metadataTemp, JSON.stringify(ready), {flag: "wx"});
      await rename(metadataTemp, this.metadataPath(id));
      this.jobs.set(id, ready);
    } catch (error) {
      await rm(thumbnailTemp, {force: true});
      await rm(metadataTemp, {force: true});
      if (this.cancelled.delete(id)) {
        await rm(this.thumbnailPath(id), {force: true});
        this.jobs.delete(id);
      } else this.jobs.set(id, {id, status: "error", error: error instanceof Error ? error.message : "Media analysis failed"});
    }
  }

  async remove(id: string) {
    if (!/^[a-f0-9]{24}$/.test(id)) return false;
    const current = this.jobs.get(id);
    if (current?.status === "queued" || current?.status === "processing") this.cancelled.add(id);
    this.jobs.delete(id);
    await Promise.all([rm(this.metadataPath(id), {force: true}), rm(this.thumbnailPath(id), {force: true})]);
    return true;
  }
}
