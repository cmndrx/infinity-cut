import {createHash} from "node:crypto";
import {mkdir, rename, rm, stat} from "node:fs/promises";
import path from "node:path";
import {spawn, type ChildProcess} from "node:child_process";

export type ProxyStatus = {
  id: string;
  status: "queued" | "processing" | "ready" | "error";
  url?: string;
  fileSize?: number;
  generatedAt?: number;
  error?: string;
};

export const proxyIdForSource = (src: string) => createHash("sha256").update(src).digest("hex").slice(0, 24);

export const buildProxyFfmpegArgs = (source: string, output: string) => [
  "-hide_banner", "-loglevel", "error", "-y", "-i", source,
  "-map", "0:v:0", "-map", "0:a?", "-sn", "-dn",
  "-vf", "scale=w='min(960,iw)':h=-2:force_original_aspect_ratio=decrease,setsar=1",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
  "-force_key_frames", "expr:gte(t,n_forced*1)",
  "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000",
  "-movflags", "+faststart", output,
];

export class ProxyManager {
  private readonly jobs = new Map<string, ProxyStatus>();
  private readonly processes = new Map<string, ChildProcess>();
  private readonly cancelled = new Set<string>();

  constructor(private readonly proxyDir: string, private readonly resolveSource: (src: string) => string) {}

  private outputPath(id: string) {
    return path.join(this.proxyDir, `${id}.mp4`);
  }

  private publicStatus(status: ProxyStatus): ProxyStatus {
    return {...status, url: status.status === "ready" ? `/api/proxies/${status.id}/proxy.mp4` : undefined};
  }

  async status(id: string): Promise<ProxyStatus | null> {
    if (!/^[a-f0-9]{24}$/.test(id)) return null;
    const current = this.jobs.get(id);
    if (current) return this.publicStatus(current);
    const file = await stat(this.outputPath(id)).catch(() => null);
    if (!file?.isFile()) return null;
    return this.publicStatus({id, status: "ready", fileSize: file.size, generatedAt: file.mtimeMs});
  }

  async start(src: string): Promise<ProxyStatus> {
    const id = proxyIdForSource(src);
    const existing = await this.status(id);
    if (existing) return existing;
    const source = this.resolveSource(src);
    if (/^https?:\/\//i.test(source)) throw new Error("Remote media must be staged locally before creating a proxy");
    const sourceFile = await stat(source).catch(() => null);
    if (!sourceFile?.isFile()) throw new Error("Original media is unavailable for proxy generation");
    await mkdir(this.proxyDir, {recursive: true});
    const target = this.outputPath(id);
    const temporary = path.join(this.proxyDir, `.${id}-${Date.now()}.mp4`);
    const queued: ProxyStatus = {id, status: "queued"};
    this.cancelled.delete(id);
    this.jobs.set(id, queued);
    queueMicrotask(() => this.generate(id, source, temporary, target));
    return this.publicStatus(queued);
  }

  private generate(id: string, source: string, temporary: string, target: string) {
    const child = spawn("ffmpeg", buildProxyFfmpegArgs(source, temporary), {stdio: ["ignore", "pipe", "pipe"]});
    this.processes.set(id, child);
    this.jobs.set(id, {id, status: "processing"});
    let stderr = "";
    child.stderr?.on("data", (chunk) => {stderr = `${stderr}${String(chunk)}`.slice(-4_000);});
    child.once("error", (error) => {
      this.processes.delete(id);
      if (this.cancelled.delete(id)) {
        void rm(temporary, {force: true});
        return;
      }
      this.jobs.set(id, {id, status: "error", error: error.message});
      void rm(temporary, {force: true});
    });
    child.once("exit", (code, signal) => {
      this.processes.delete(id);
      if (this.cancelled.delete(id)) {
        void rm(temporary, {force: true});
        return;
      }
      if (code !== 0) {
        if (this.jobs.get(id)?.status !== "error") this.jobs.set(id, {id, status: "error", error: signal ? `Proxy generation stopped (${signal})` : stderr.trim() || `FFmpeg exited with code ${code}`});
        void rm(temporary, {force: true});
        return;
      }
      void (async () => {
        try {
          await rename(temporary, target);
          const file = await stat(target);
          this.jobs.set(id, {id, status: "ready", fileSize: file.size, generatedAt: Date.now()});
        } catch (error) {
          this.jobs.set(id, {id, status: "error", error: error instanceof Error ? error.message : "Proxy could not be finalized"});
          await rm(temporary, {force: true});
        }
      })();
    });
  }

  async remove(id: string) {
    if (!/^[a-f0-9]{24}$/.test(id)) return false;
    if (this.processes.has(id)) this.cancelled.add(id);
    this.processes.get(id)?.kill("SIGTERM");
    this.processes.delete(id);
    this.jobs.delete(id);
    await rm(this.outputPath(id), {force: true});
    return true;
  }
}
