import {mkdir, readFile, rename, stat, unlink, writeFile} from "node:fs/promises";
import path from "node:path";

export type QueueStage = "queued" | "bundling" | "rendering" | "packaging" | "complete" | "cancelled" | "error";

export type StoredExportJob<T> = {
  id: string;
  stage: QueueStage;
  progress: number;
  message: string;
  filename: string;
  outputPath: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  sizeBytes?: number;
  error?: string;
  request: T;
};

type RunnerControls = {setState: (patch: Partial<Pick<StoredExportJob<unknown>, "stage" | "progress" | "message">>) => Promise<void>; signal: AbortSignal};
type Runner<T> = (job: StoredExportJob<T>, controls: RunnerControls) => Promise<{sizeBytes?: number}>;

const activeStages = new Set<QueueStage>(["bundling", "rendering", "packaging"]);

export class PersistentExportQueue<T> {
  private readonly jobs = new Map<string, StoredExportJob<T>>();
  private activeId: string | null = null;
  private activeAbort: AbortController | null = null;
  private initialized = false;
  private persisting: Promise<void> = Promise.resolve();

  constructor(private readonly stateFile: string, private readonly runner: Runner<T>, private readonly outputDirectory = path.dirname(stateFile)) {}

  private isSafeOutput(outputPath: string) {
    const relative = path.relative(path.resolve(this.outputDirectory), path.resolve(outputPath));
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const stored = JSON.parse(await readFile(this.stateFile, "utf8")) as StoredExportJob<T>[];
      for (const candidate of Array.isArray(stored) ? stored : []) {
        if (!candidate?.id || !candidate.request || !candidate.outputPath || !this.isSafeOutput(candidate.outputPath)) continue;
        const job = {...candidate};
        if (activeStages.has(job.stage)) {
          job.stage = "queued";
          job.progress = 0;
          job.message = "Recovered after restart";
          job.error = undefined;
        }
        if (job.stage === "complete" && !(await stat(job.outputPath).catch(() => null))) {
          job.stage = "error";
          job.message = "Export file is missing";
          job.error = "The completed output could not be found after restart.";
        }
        this.jobs.set(job.id, job);
      }
      await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.schedule();
  }

  list() { return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt); }
  get(id: string) { return this.jobs.get(id); }

  async add(job: StoredExportJob<T>) {
    if (!this.isSafeOutput(job.outputPath)) throw new Error("Export output must stay inside the configured render directory");
    this.jobs.set(job.id, job);
    await this.persist();
    this.schedule();
    return job;
  }

  async cancel(id: string) {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.stage === "queued" || activeStages.has(job.stage)) {
      job.stage = "cancelled";
      job.message = id === this.activeId ? "Cancelling export" : "Export cancelled";
      job.error = undefined;
      job.updatedAt = Date.now();
      if (id === this.activeId) this.activeAbort?.abort();
      await this.persist();
    }
    return job;
  }

  async retry(id: string) {
    const job = this.jobs.get(id);
    if (!job || !["cancelled", "error"].includes(job.stage)) return null;
    job.stage = "queued";
    job.progress = 0;
    job.message = "Export queued for retry";
    job.error = undefined;
    job.sizeBytes = undefined;
    job.updatedAt = Date.now();
    await unlink(job.outputPath).catch(() => undefined);
    await this.persist();
    this.schedule();
    return job;
  }

  async remove(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.stage === "queued" || activeStages.has(job.stage)) return false;
    this.jobs.delete(id);
    await unlink(job.outputPath).catch(() => undefined);
    await this.persist();
    return true;
  }

  private schedule() {
    if (this.activeId) return;
    const next = [...this.jobs.values()].filter((job) => job.stage === "queued").sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;
    this.activeId = next.id;
    this.activeAbort = new AbortController();
    void this.execute(next, this.activeAbort);
  }

  private async execute(job: StoredExportJob<T>, abort: AbortController) {
    job.attempts += 1;
    job.updatedAt = Date.now();
    await this.persist();
    let lastProgressPersistedAt = 0;
    try {
      const result = await this.runner(job, {
        signal: abort.signal,
        setState: async (patch) => {
          if (abort.signal.aborted) return;
          Object.assign(job, patch, {updatedAt: Date.now()});
          const onlyProgress = Object.keys(patch).every((key) => key === "progress");
          if (!onlyProgress || Date.now() - lastProgressPersistedAt >= 500) {
            lastProgressPersistedAt = Date.now();
            await this.persist();
          }
        },
      });
      if (abort.signal.aborted || job.stage === "cancelled") {
        job.stage = "cancelled";
        job.message = "Export cancelled";
        await unlink(job.outputPath).catch(() => undefined);
      } else {
        job.stage = "complete";
        job.progress = 100;
        job.message = "Export ready to download";
        job.sizeBytes = result.sizeBytes ?? (await stat(job.outputPath)).size;
      }
    } catch (error) {
      if (abort.signal.aborted) {
        job.stage = "cancelled";
        job.message = "Export cancelled";
        job.error = undefined;
      } else {
        job.stage = "error";
        job.message = "Export failed";
        job.error = error instanceof Error ? error.message : String(error);
      }
      await unlink(job.outputPath).catch(() => undefined);
    } finally {
      job.updatedAt = Date.now();
      await this.persist();
      this.activeId = null;
      this.activeAbort = null;
      this.schedule();
    }
  }

  private async persist() {
    const snapshot = JSON.stringify(this.list(), null, 2);
    this.persisting = this.persisting.then(async () => {
      await mkdir(path.dirname(this.stateFile), {recursive: true});
      const temporary = `${this.stateFile}.tmp`;
      await writeFile(temporary, snapshot, "utf8");
      await rename(temporary, this.stateFile);
    });
    await this.persisting;
  }
}
