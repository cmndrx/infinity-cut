import {mkdir, rename, rm, stat} from "node:fs/promises";
import path from "node:path";
import type {EditorProject} from "../src/editor/types";
import {projectRenderFingerprint} from "../src/editor/render-cache";

export type RenderCacheStatus = {
  id: string;
  fingerprint: string;
  status: "queued" | "rendering" | "ready" | "error";
  url?: string;
  generatedAt?: number;
  fileSize?: number;
  error?: string;
};

export const renderCacheId = (project: EditorProject) => `cache-${projectRenderFingerprint(project)}`;

export class RenderCacheManager {
  private readonly jobs = new Map<string, RenderCacheStatus>();
  private readonly cancelled = new Set<string>();

  constructor(private readonly cacheDir: string, private readonly render: (project: EditorProject, output: string, onProgress: (progress: number) => void) => Promise<void>) {}

  outputPath(id: string) { return path.join(this.cacheDir, `${id}.mp4`); }
  private publicStatus(status: RenderCacheStatus): RenderCacheStatus {
    return {...status, url: status.status === "ready" ? `/api/render-cache/${status.id}/preview.mp4` : undefined};
  }

  async status(id: string): Promise<RenderCacheStatus | null> {
    if (!/^cache-[a-f0-9]{8}$/.test(id)) return null;
    const active = this.jobs.get(id);
    if (active) return this.publicStatus(active);
    const file = await stat(this.outputPath(id)).catch(() => null);
    if (!file?.isFile()) return null;
    return this.publicStatus({id, fingerprint: id.slice(6), status: "ready", generatedAt: file.mtimeMs, fileSize: file.size});
  }

  async start(project: EditorProject) {
    const id = renderCacheId(project);
    const existing = await this.status(id);
    if (existing) return existing;
    await mkdir(this.cacheDir, {recursive: true});
    const queued: RenderCacheStatus = {id, fingerprint: id.slice(6), status: "queued"};
    this.cancelled.delete(id);
    this.jobs.set(id, queued);
    queueMicrotask(() => void this.generate(id, project));
    return queued;
  }

  private async generate(id: string, project: EditorProject) {
    const target = this.outputPath(id);
    const temporary = path.join(this.cacheDir, `.${id}-${Date.now()}.mp4`);
    this.jobs.set(id, {id, fingerprint: id.slice(6), status: "rendering"});
    try {
      await this.render(project, temporary, () => undefined);
      if (this.cancelled.has(id)) throw new Error("Timeline cache cancelled");
      await rename(temporary, target);
      const file = await stat(target);
      this.jobs.set(id, {id, fingerprint: id.slice(6), status: "ready", generatedAt: Date.now(), fileSize: file.size});
    } catch (error) {
      await rm(temporary, {force: true});
      if (this.cancelled.delete(id)) this.jobs.delete(id);
      else this.jobs.set(id, {id, fingerprint: id.slice(6), status: "error", error: error instanceof Error ? error.message : "Timeline cache failed"});
    }
  }

  async remove(id: string) {
    if (!/^cache-[a-f0-9]{8}$/.test(id)) return false;
    const current = this.jobs.get(id);
    if (current?.status === "queued" || current?.status === "rendering") this.cancelled.add(id);
    this.jobs.delete(id);
    await rm(this.outputPath(id), {force: true});
    return true;
  }
}
