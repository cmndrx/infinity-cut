import {mkdtemp, readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {SharedProjectStore} from "./collaboration-server";
import {createBlankProject} from "./src/editor/project-storage";

describe("private shared project store", () => {
  it("persists private revisions and rejects stale or invalid writers", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "directors-collab-"));
    const store = new SharedProjectStore(directory);
    const project = createBlankProject({name: "Shared cut", width: 1920, height: 1080, fps: 30});
    const {record, token, reviewerToken} = await store.create(project);
    expect(record.revision).toBe(1);

    const updated = await store.update(record.id, token, 1, {...project, name: "Remote cut"});
    expect(updated.revision).toBe(2);
    expect(updated.project.name).toBe("Remote cut");
    await expect(store.update(record.id, token, 1, project)).rejects.toMatchObject({status: 409});
    await expect(store.update(record.id, "wrong-token", 2, project)).rejects.toMatchObject({status: 403});
    await expect(store.update(record.id, reviewerToken, 2, project)).rejects.toMatchObject({status: 403});
    const reviewerComment = {id: "review-1", sequenceId: project.activeSequenceId, frame: 0, author: "Spoofed editor", body: "Tighten this cut", status: "open" as const, createdAt: 1, updatedAt: 1, replies: []};
    const commented = await store.appendComment(record.id, reviewerToken, reviewerComment);
    expect(commented.comments[0].author).toBe("Reviewer");
    await expect(store.replaceComments(record.id, reviewerToken, [])).rejects.toMatchObject({status: 403});

    const persisted = JSON.parse(await readFile(path.join(directory, `${record.id}.json`), "utf8")) as {editorTokenHash: string; reviewerTokenHash: string; token?: string; versions: unknown[]};
    expect(persisted.token).toBeUndefined();
    expect(persisted.editorTokenHash).not.toContain(token);
    expect(persisted.reviewerTokenHash).not.toContain(reviewerToken);
    expect(persisted.versions).toHaveLength(2);
  });

  it("rejects traversal ids before reading disk", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "directors-collab-"));
    const store = new SharedProjectStore(directory);
    await expect(store.read("../../private-key")).rejects.toThrow("Invalid shared project id");
  });
});
