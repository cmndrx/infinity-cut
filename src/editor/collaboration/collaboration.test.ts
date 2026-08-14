import {describe, expect, it} from "vitest";
import {createBlankProject} from "../project-storage";
import {createDefaultMask} from "../masks";
import {DEFAULT_EFFECTS, DEFAULT_TRANSFORM, type EditorClip} from "../types";
import {createReviewComment, replyToReviewComment, setReviewCommentResolved} from "./comments";
import {detectThreeWayConflicts, diffProjects} from "./diff";
import {createVersionSnapshot, projectChecksum} from "./versions";

const baseProject = () => {
  const project = createBlankProject({name: "Shared Cut", width: 1920, height: 1080, fps: 30});
  const clip: EditorClip = {
    id: "clip-1", name: "Shot", kind: "video", trackId: "v1", start: 10, duration: 60, sourceStart: 0, src: "/shot.mp4",
    color: "#fff", volume: 1, fadeIn: 0, fadeOut: 0, audioMuted: false, transform: {...DEFAULT_TRANSFORM}, effects: {...DEFAULT_EFFECTS}, keyframes: [],
  };
  project.clips = [clip];
  return project;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("review comments", () => {
  it("creates frame comments, replies, and resolution transitions immutably", () => {
    const comment = createReviewComment({id: "comment-1", sequenceId: "sequence-1", frame: 42.4, endFrame: 50, author: "Editor", body: " Tighten this cut ", now: 100});
    const replied = replyToReviewComment(comment, {id: "reply-1", author: "Director", body: "Done", now: 200});
    const resolved = setReviewCommentResolved(replied, true, 300);
    expect(comment).toMatchObject({frame: 42, body: "Tighten this cut", status: "open", replies: []});
    expect(replied.replies[0]).toMatchObject({id: "reply-1", body: "Done"});
    expect(resolved).toMatchObject({status: "resolved", updatedAt: 300});
  });

  it("rejects empty author and body values", () => {
    expect(() => createReviewComment({sequenceId: "sequence-1", frame: 0, author: "", body: "Note"})).toThrow("Author is required");
    expect(() => createReviewComment({sequenceId: "sequence-1", frame: 0, author: "Editor", body: " "})).toThrow("Comment is required");
  });
});

describe("semantic project comparison", () => {
  it("classifies clip movement, trimming, effects, and additions", () => {
    const before = baseProject();
    const after = clone(before);
    after.clips[0].start = 20;
    after.clips[0].duration = 45;
    after.clips[0].effects.blur = 8;
    after.markers.push({id: "marker-1", frame: 20, label: "Review", color: "#fff"});
    const changes = diffProjects(before, after);
    expect(changes.filter((change) => change.entityId === "clip-1").map((change) => change.category)).toEqual(expect.arrayContaining(["moved", "trimmed", "effects"]));
    expect(changes).toContainEqual(expect.objectContaining({entityType: "marker", entityId: "marker-1", category: "added"}));
  });

  it("includes professional grades and masks in effect comparisons", () => {
    const before = baseProject();
    const after = clone(before);
    after.clips[0].effectMasks = [createDefaultMask("mask-1")];
    expect(diffProjects(before, after)).toContainEqual(expect.objectContaining({entityId: "clip-1", category: "effects"}));
  });
});

describe("three-way conflict detection", () => {
  it("allows disjoint property edits without reporting a conflict", () => {
    const base = baseProject();
    const local = clone(base);
    const remote = clone(base);
    local.clips[0].start = 30;
    remote.clips[0].effects.blur = 5;
    expect(detectThreeWayConflicts(base, local, remote)).toEqual([]);
  });

  it("reports divergent edits to the same property", () => {
    const base = baseProject();
    const local = clone(base);
    const remote = clone(base);
    local.clips[0].start = 20;
    remote.clips[0].start = 40;
    expect(detectThreeWayConflicts(base, local, remote)).toContainEqual(expect.objectContaining({entityType: "clip", entityId: "clip-1", path: "start", reason: "divergent-edit", base: 10, local: 20, remote: 40}));
  });

  it("reports deletion against an edited entity", () => {
    const base = baseProject();
    const local = clone(base);
    const remote = clone(base);
    local.clips = [];
    remote.clips[0].duration = 90;
    expect(detectThreeWayConflicts(base, local, remote)).toContainEqual(expect.objectContaining({entityType: "clip", entityId: "clip-1", reason: "delete-vs-edit"}));
  });
});

describe("version snapshots", () => {
  it("clones project state and creates deterministic checksums", () => {
    const project = baseProject();
    const snapshot = createVersionSnapshot(project, {revision: 2, parentRevision: 1, author: "Editor", now: 123});
    project.clips[0].start = 999;
    expect(snapshot.project.clips[0].start).toBe(10);
    expect(snapshot.checksum).toBe(projectChecksum(snapshot.project));
    expect(snapshot).toMatchObject({revision: 2, parentRevision: 1, author: "Editor", createdAt: 123});
  });
});
