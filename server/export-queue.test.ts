import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {PersistentExportQueue, type StoredExportJob} from "./export-queue";

const temporaryDirectories: string[] = [];
const temporary = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dcpro-queue-"));
  temporaryDirectories.push(directory);
  return directory;
};
const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for queue");
};
const job = (directory: string, id: string, createdAt: number): StoredExportJob<{value: string}> => ({
  id, stage: "queued", progress: 0, message: "queued", filename: `${id}.txt`, outputPath: path.join(directory, `${id}.txt`),
  createdAt, updatedAt: createdAt, attempts: 0, request: {value: id},
});

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {recursive: true, force: true}))));

describe("PersistentExportQueue", () => {
  it("runs FIFO with concurrency one and persists terminal metadata", async () => {
    const directory = await temporary();
    const order: string[] = [];
    let concurrent = 0;
    let maximum = 0;
    const queue = new PersistentExportQueue(path.join(directory, "queue.json"), async (entry) => {
      concurrent += 1; maximum = Math.max(maximum, concurrent); order.push(entry.id);
      await new Promise((resolve) => setTimeout(resolve, 8));
      await writeFile(entry.outputPath, entry.id);
      concurrent -= 1;
      return {};
    });
    await queue.initialize();
    await queue.add(job(directory, "first", 1));
    await queue.add(job(directory, "second", 2));
    await waitFor(() => queue.get("second")?.stage === "complete");
    expect(order).toEqual(["first", "second"]);
    expect(maximum).toBe(1);
    expect(JSON.parse(await readFile(path.join(directory, "queue.json"), "utf8"))).toEqual(expect.arrayContaining([expect.objectContaining({id: "first", stage: "complete", attempts: 1})]));
  });

  it("recovers interrupted work and supports retry and removal", async () => {
    const directory = await temporary();
    const stateFile = path.join(directory, "queue.json");
    const interrupted = {...job(directory, "recover", 1), stage: "rendering" as const};
    await writeFile(stateFile, JSON.stringify([interrupted]));
    let shouldFail = true;
    const queue = new PersistentExportQueue(stateFile, async (entry) => {
      if (shouldFail) throw new Error("encoder unavailable");
      await writeFile(entry.outputPath, "ok");
      return {};
    });
    await queue.initialize();
    await waitFor(() => queue.get("recover")?.stage === "error");
    shouldFail = false;
    expect(await queue.retry("recover")).toMatchObject({stage: "queued"});
    await waitFor(() => queue.get("recover")?.stage === "complete");
    expect(queue.get("recover")?.attempts).toBe(2);
    expect(await queue.remove("recover")).toBe(true);
    expect(queue.get("recover")).toBeUndefined();
  });
});
