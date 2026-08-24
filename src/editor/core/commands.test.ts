import {describe, expect, it} from "vitest";
import {createBlankProject} from "../project-storage";
import type {EditorClip, EditorProject} from "../types";
import {DEFAULT_EFFECTS, DEFAULT_TITLE_STYLE, DEFAULT_TRANSFORM} from "../types";
import {cloneClips, editTimelineRange, executeTimelineCommand, moveClips, placeMedia, retimeClip, rippleDelete, splitClip, trimClip, type CommandResult, type CommandSuccess} from "./commands";

const clip = (updates: Partial<EditorClip> = {}): EditorClip => ({
  id: "video",
  name: "Video",
  kind: "video",
  trackId: "v1",
  start: 0,
  duration: 20,
  sourceStart: 4,
  color: "#fff",
  volume: 1,
  fadeIn: 4,
  fadeOut: 6,
  audioMuted: false,
  playbackRate: 1,
  preservePitch: true,
  transform: {...DEFAULT_TRANSFORM},
  effects: {...DEFAULT_EFFECTS},
  keyframes: [],
  ...updates,
});

const project = (): EditorProject => createBlankProject({name: "Core", width: 1920, height: 1080, fps: 30});

const successful = (result: CommandResult): CommandSuccess => {
  if (!result.ok) throw new Error(`${result.error.message}: ${JSON.stringify(result.error.issues ?? [])}`);
  expect(result.ok).toBe(true);
  return result;
};

describe("timeline commands", () => {
  it("splits an entire linked group, preserves source offsets, and rewires an outgoing transition", () => {
    const value = project();
    value.clips = [
      clip({id: "video", linkedGroupId: "av", playbackRate: 2, keyframes: [{id: "opacity", property: "transform.opacity", frame: 10, value: 50, easing: "linear"}]}),
      clip({id: "audio", name: "Audio", kind: "audio", trackId: "a1", linkedGroupId: "av"}),
      clip({id: "next", start: 20}),
    ];
    value.transitions = [{id: "out", fromClipId: "video", toClipId: "next", type: "cross-dissolve", duration: 6}];
    const snapshot = structuredClone(value);

    const result = successful(splitClip(value, "video", 10));
    expect(value).toEqual(snapshot);
    expect(result.createdClipIds).toEqual(["video-split-10", "audio-split-10"]);
    expect(result.project.clips.find((item) => item.id === "video-split-10")).toMatchObject({start: 10, duration: 10, sourceStart: 24, linkedGroupId: "av-split-10"});
    expect(result.project.clips.find((item) => item.id === "audio-split-10")?.linkedGroupId).toBe("av-split-10");
    expect(result.project.clips.find((item) => item.id === "video")?.linkedGroupId).toBe("av");
    expect(result.project.clips.find((item) => item.id === "video-split-10")?.keyframes).toMatchObject([{frame: 0, value: 50}]);
    expect(result.project.transitions[0]).toMatchObject({fromClipId: "video-split-10", toClipId: "next"});

    const undone = successful(executeTimelineCommand(result.project, result.inverse));
    expect(undone.project).toEqual(snapshot);
  });

  it("rejects a linked split atomically when one member is locked or cannot be split", () => {
    const value = project();
    value.clips = [clip({linkedGroupId: "av"}), clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"})];
    const audioTrack = value.tracks.find((track) => track.id === "a1");
    if (audioTrack) audioTrack.locked = true;
    const result = splitClip(value, "video", 10);
    expect(result).toMatchObject({ok: false, error: {code: "TRACK_LOCKED"}});
    expect(result.project).toEqual(value);
  });

  it("allows an intentional single-clip split when linked selection is disabled", () => {
    const value = project();
    value.clips = [
      clip({id: "video", linkedGroupId: "av"}),
      clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"}),
    ];
    const result = successful(splitClip(value, "video", 10, false));
    expect(result.createdClipIds).toEqual(["video-split-10"]);
    expect(result.project.clips.filter((item) => item.kind === "audio")).toHaveLength(1);
    expect(result.project.clips.find((item) => item.id === "video-split-10")?.linkedGroupId).toBeUndefined();
  });

  it("splits only linked members that intersect the edit point", () => {
    const value = project();
    value.clips = [
      clip({id: "video", linkedGroupId: "av"}),
      clip({id: "audio", kind: "audio", trackId: "a1", start: 12, duration: 8, fadeIn: 0, fadeOut: 0, linkedGroupId: "av"}),
    ];
    const result = successful(splitClip(value, "video", 10));
    expect(result.createdClipIds).toEqual(["video-split-10"]);
    expect(result.project.clips.find((item) => item.id === "audio")).toMatchObject({start: 12, duration: 8, linkedGroupId: "av-split-10"});
    expect(result.project.clips.find((item) => item.id === "video")?.linkedGroupId).toBe("av");
  });

  it("rejects a partial linked split when reassignment would mutate a locked track", () => {
    const value = project();
    value.clips = [
      clip({id: "video", linkedGroupId: "av"}),
      clip({id: "audio", kind: "audio", trackId: "a1", start: 12, duration: 8, fadeIn: 0, fadeOut: 0, linkedGroupId: "av"}),
    ];
    const audioTrack = value.tracks.find((track) => track.id === "a1");
    if (audioTrack) audioTrack.locked = true;
    expect(splitClip(value, "video", 10)).toMatchObject({ok: false, error: {code: "TRACK_LOCKED", entityId: "audio"}});
  });

  it("ripple deletes linked media and propagates shifts to a downstream linked group", () => {
    const value = project();
    value.clips = [
      clip({id: "delete-video", linkedGroupId: "delete"}),
      clip({id: "delete-audio", kind: "audio", trackId: "a1", linkedGroupId: "delete"}),
      clip({id: "later-video", start: 20, linkedGroupId: "later"}),
      clip({id: "later-audio", kind: "audio", trackId: "a1", start: 20, linkedGroupId: "later"}),
    ];
    value.transitions = [{id: "doomed", fromClipId: "delete-video", toClipId: "later-video", type: "cross-dissolve", duration: 6}];
    const result = successful(rippleDelete(value, ["delete-video"]));
    expect(result.removedClipIds).toEqual(["delete-video", "delete-audio"]);
    expect(result.project.clips.map((item) => [item.id, item.start])).toEqual([["later-video", 0], ["later-audio", 0]]);
    expect(result.prunedTransitionIds).toEqual(["doomed"]);
  });

  it("fails rather than desynchronizing a downstream linked group with conflicting ripple deltas", () => {
    const value = project();
    value.clips = [
      clip({id: "delete-video", linkedGroupId: "delete", duration: 20}),
      clip({id: "delete-audio", kind: "audio", trackId: "a1", linkedGroupId: "delete", duration: 30}),
      clip({id: "later-video", start: 30, linkedGroupId: "later"}),
      clip({id: "later-audio", kind: "audio", trackId: "a1", start: 30, linkedGroupId: "later"}),
    ];
    const result = rippleDelete(value, ["delete-video"]);
    expect(result).toMatchObject({ok: false, error: {code: "LINKED_OPERATION_CONFLICT"}});
    expect(result.project).toEqual(value);
  });

  it("does not ripple media on a locked downstream track", () => {
    const value = project();
    value.clips = [
      clip({id: "delete"}),
      clip({id: "later-video", start: 20, linkedGroupId: "later"}),
      clip({id: "later-audio", kind: "audio", trackId: "a1", start: 20, linkedGroupId: "later"}),
    ];
    const audioTrack = value.tracks.find((track) => track.id === "a1");
    if (audioTrack) audioTrack.locked = true;
    const result = rippleDelete(value, ["delete"]);
    expect(result).toMatchObject({ok: false, error: {code: "TRACK_LOCKED"}});
    expect(result.project).toEqual(value);
  });

  it("preserves survivor order when ripple deleting discontiguous ranges", () => {
    const value = project();
    value.durationInFrames = 80;
    value.clips = [
      clip({id: "first", start: 0, duration: 10}),
      clip({id: "middle", start: 10, duration: 10}),
      clip({id: "third", start: 20, duration: 10}),
      clip({id: "tail", start: 30, duration: 10}),
    ];
    const result = successful(rippleDelete(value, ["first", "third"], false));
    expect(result.project.clips.map((item) => [item.id, item.start])).toEqual([["middle", 0], ["tail", 10]]);
  });

  it("fails closed when a ripple range partially overlaps a surviving clip", () => {
    const value = project();
    value.clips = [clip({id: "delete", start: 0, duration: 10}), clip({id: "overlap", start: 5, duration: 10})];
    expect(rippleDelete(value, ["delete"], false)).toMatchObject({ok: false, error: {code: "LINKED_OPERATION_CONFLICT", entityId: "overlap"}});
  });

  it("lifts a timeline range while preserving the gap and source/keyframe offsets", () => {
    const value = project();
    value.durationInFrames = 80;
    value.clips = [clip({
      id: "long",
      start: 0,
      duration: 40,
      sourceStart: 10,
      playbackRate: 2,
      keyframes: [
        {id: "left-key", property: "transform.opacity", frame: 5, value: 25, easing: "linear"},
        {id: "right-key", property: "transform.opacity", frame: 30, value: 75, easing: "linear"},
      ],
    })];
    const result = successful(editTimelineRange(value, {mode: "lift", inFrame: 10, outFrame: 20, trackIds: ["v1"], idBase: "lift", includeLinked: false}));
    expect(result.project.clips).toHaveLength(2);
    expect(result.project.clips[0]).toMatchObject({id: "long", start: 0, duration: 10, sourceStart: 10});
    expect(result.project.clips[0].keyframes).toEqual([expect.objectContaining({id: "left-key", frame: 5})]);
    expect(result.project.clips[1]).toMatchObject({id: "lift-long-right", start: 20, duration: 20, sourceStart: 50});
    expect(result.project.clips[1].keyframes).toEqual([expect.objectContaining({frame: 10, value: 75})]);
  });

  it("extracts a targeted range and closes the gap across downstream linked clips", () => {
    const value = project();
    value.durationInFrames = 80;
    value.clips = [
      clip({id: "remove", start: 10, duration: 10}),
      clip({id: "later-video", start: 30, duration: 10, linkedGroupId: "later"}),
      clip({id: "later-audio", kind: "audio", trackId: "a1", start: 30, duration: 10, linkedGroupId: "later"}),
    ];
    const result = successful(editTimelineRange(value, {mode: "extract", inFrame: 10, outFrame: 20, trackIds: ["v1"], idBase: "extract"}));
    expect(result.removedClipIds).toEqual(["remove"]);
    expect(result.project.clips.map((item) => [item.id, item.start])).toEqual([["later-video", 20], ["later-audio", 20]]);
  });

  it("fails a linked range edit atomically when an affected linked track is locked", () => {
    const value = project();
    value.clips = [
      clip({id: "video", linkedGroupId: "av"}),
      clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"}),
    ];
    const audioTrack = value.tracks.find((track) => track.id === "a1");
    if (audioTrack) audioTrack.locked = true;
    const result = editTimelineRange(value, {mode: "lift", inFrame: 5, outFrame: 10, trackIds: ["v1"], idBase: "locked"});
    expect(result).toMatchObject({ok: false, error: {code: "TRACK_LOCKED", entityId: "a1"}});
    expect(result.project).toEqual(value);
  });

  it("retimes linked clips, ripples trailing media, and round-trips through its inverse", () => {
    const value = project();
    value.clips = [
      clip({id: "video", duration: 120, fadeIn: 12, fadeOut: 24, linkedGroupId: "av", keyframes: [{id: "key", property: "transform.opacity", frame: 60, value: 50, easing: "linear"}]}),
      clip({id: "audio", kind: "audio", trackId: "a1", duration: 120, linkedGroupId: "av"}),
      clip({id: "later-video", start: 120, linkedGroupId: "later"}),
      clip({id: "later-audio", kind: "audio", trackId: "a1", start: 120, linkedGroupId: "later"}),
    ];
    const snapshot = structuredClone(value);
    const result = successful(retimeClip(value, {clipId: "video", playbackRate: 2, ripple: true, preservePitch: false}));
    expect(result.project.clips.find((item) => item.id === "video")).toMatchObject({duration: 60, playbackRate: 2, preservePitch: false, fadeIn: 6, fadeOut: 12});
    expect(result.project.clips.find((item) => item.id === "video")?.keyframes[0].frame).toBe(30);
    expect(result.project.clips.find((item) => item.id === "audio")).toMatchObject({duration: 60, playbackRate: 2, preservePitch: false});
    expect(result.project.clips.find((item) => item.id === "later-video")?.start).toBe(60);
    expect(result.project.clips.find((item) => item.id === "later-audio")?.start).toBe(60);

    const undone = successful(executeTimelineCommand(result.project, result.inverse));
    expect(undone.project).toEqual(snapshot);
  });

  it("rejects out-of-range playback speeds", () => {
    const value = project();
    value.clips = [clip()];
    expect(retimeClip(value, {clipId: "video", playbackRate: 0})).toMatchObject({ok: false, error: {code: "INVALID_PLAYBACK_RATE"}});
  });

  it("reports a value-identical retime as unchanged", () => {
    const value = project();
    value.clips = [clip()];
    const result = successful(retimeClip(value, {clipId: "video", playbackRate: 1, ripple: true, preservePitch: true}));
    expect(result.changed).toBe(false);
    expect(result.project).toEqual(value);
  });

  it("treats omitted playback defaults as a semantic no-op", () => {
    const value = project();
    value.clips = [clip()];
    delete value.clips[0].playbackRate;
    delete value.clips[0].preservePitch;
    const result = successful(retimeClip(value, {clipId: "video", playbackRate: 1, ripple: true, preservePitch: true}));
    expect(result.changed).toBe(false);
    expect(result.project.clips[0]).not.toHaveProperty("playbackRate");
  });

  it("keeps fades valid and deterministically merges collapsed keyframes during retime", () => {
    const value = project();
    value.clips = [clip({
      duration: 10,
      fadeIn: 5,
      fadeOut: 5,
      keyframes: [
        {id: "first", property: "transform.opacity", frame: 5, value: 25, easing: "linear"},
        {id: "second", property: "transform.opacity", frame: 6, value: 75, easing: "linear"},
      ],
    })];
    const result = successful(retimeClip(value, {clipId: "video", playbackRate: 10 / 9, preservePitch: true}));
    expect(result.project.clips[0]).toMatchObject({duration: 9, fadeIn: 5, fadeOut: 4});
    expect(result.project.clips[0].keyframes).toEqual([{id: "second", property: "transform.opacity", frame: 5, value: 75, easing: "linear"}]);
  });

  it("rejects a retime that would create a new same-track overlap", () => {
    const value = project();
    value.clips = [
      clip({id: "first", duration: 10, playbackRate: 2}),
      clip({id: "second", start: 10, duration: 10}),
    ];
    expect(retimeClip(value, {clipId: "first", playbackRate: 1, ripple: false, includeLinked: false})).toMatchObject({
      ok: false,
      error: {code: "INVALID_PROJECT", issues: [expect.objectContaining({code: "TRACK_OVERLAP"})]},
    });
  });

  it("rejects worsened legacy overlap but allows exact inverse restoration", () => {
    const worsening = project();
    worsening.clips = [
      clip({id: "first", duration: 10, playbackRate: 2}),
      clip({id: "second", start: 9, duration: 10}),
    ];
    expect(retimeClip(worsening, {clipId: "first", playbackRate: 1, ripple: false, includeLinked: false})).toMatchObject({
      ok: false,
      error: {issues: [expect.objectContaining({code: "TRACK_OVERLAP"})]},
    });

    const restoring = project();
    restoring.clips = [
      clip({id: "first", duration: 10, playbackRate: 1}),
      clip({id: "second", start: 9, duration: 10}),
    ];
    const shortened = successful(retimeClip(restoring, {clipId: "first", playbackRate: 2, ripple: false, includeLinked: false}));
    const restored = successful(executeTimelineCommand(shortened.project, shortened.inverse));
    expect(restored.project).toEqual(restoring);
  });

  it("allows a split that preserves an existing overlap profile", () => {
    const value = project();
    value.clips = [clip({id: "first"}), clip({id: "overlap", start: 9, duration: 10})];
    expect(splitClip(value, "first", 10, false)).toMatchObject({ok: true});
  });

  it("rejects pre-existing invalid transitions instead of silently pruning them", () => {
    const value = project();
    value.clips = [clip({id: "video"})];
    value.transitions = [{id: "broken", fromClipId: "video", toClipId: "missing", type: "cross-dissolve", duration: 6}];
    const result = splitClip(value, "video", 10);
    expect(result).toMatchObject({ok: false, error: {code: "INVALID_PROJECT"}});
    expect(result.project.transitions).toEqual(value.transitions);
  });

  it("returns INVALID_PROJECT for malformed imported project data", () => {
    const value = project();
    (value as unknown as {markers: undefined}).markers = undefined;
    const result = splitClip(value, "video", 10);
    expect(result).toMatchObject({ok: false, error: {code: "INVALID_PROJECT"}});
  });

  it("returns INVALID_PROJECT for malformed collection members", () => {
    const value = project();
    (value as unknown as {tracks: null[]}).tracks = [null];
    const result = splitClip(value, "video", 10);
    expect(result).toMatchObject({ok: false, error: {code: "INVALID_PROJECT"}});
  });

  it("returns INVALID_PROJECT for malformed nested keyframe members", () => {
    const value = project();
    value.clips = [clip()];
    (value.clips[0] as unknown as {keyframes: null[]}).keyframes = [null];
    expect(splitClip(value, "video", 10)).toMatchObject({ok: false, error: {code: "INVALID_PROJECT"}});
  });

  it("rejects fabricated restore commands", () => {
    const value = project();
    expect(executeTimelineCommand(value, {type: "restore-project", project: structuredClone(value)})).toMatchObject({
      ok: false,
      error: {code: "INVALID_RESTORE"},
    });
  });

  it("moves linked clips atomically and round-trips through inverse", () => {
    const value = project();
    value.clips = [
      clip({id: "video", linkedGroupId: "av"}),
      clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"}),
    ];
    const result = successful(moveClips(value, {clipIds: ["video"], deltaFrames: 12}));
    expect(result.project.clips.map((item) => [item.id, item.start])).toEqual([["video", 12], ["audio", 12]]);
    expect(successful(executeTimelineCommand(result.project, result.inverse)).project).toEqual(value);
  });

  it("rejects locked, incompatible, negative, and colliding moves atomically", () => {
    const value = project();
    value.clips = [clip({id: "video"}), clip({id: "later", start: 30})];
    expect(moveClips(value, {clipIds: ["video"], deltaFrames: -1})).toMatchObject({ok: false, error: {code: "INVALID_FRAME"}});
    expect(moveClips(value, {clipIds: ["video"], deltaFrames: 0, trackAssignments: {video: "a1"}})).toMatchObject({ok: false, error: {code: "INCOMPATIBLE_TRACK"}});
    expect(moveClips(value, {clipIds: ["later"], deltaFrames: -15})).toMatchObject({ok: false, error: {code: "INVALID_PROJECT", issues: [expect.objectContaining({code: "TRACK_OVERLAP"})]}});
    const videoTrack = value.tracks.find((track) => track.id === "v1");
    if (videoTrack) videoTrack.locked = true;
    expect(moveClips(value, {clipIds: ["video"], deltaFrames: 1})).toMatchObject({ok: false, error: {code: "TRACK_LOCKED"}});
  });

  it("reports identity moves as no-ops without affected ids", () => {
    const value = project();
    value.clips = [clip({linkedGroupId: "av"}), clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"})];
    const result = successful(moveClips(value, {clipIds: ["video"], deltaFrames: 0, includeLinked: false}));
    expect(result.changed).toBe(false);
    expect(result.affectedClipIds).toEqual([]);
    expect(result.project.clips.map((item) => item.linkedGroupId)).toEqual(["av", "av"]);
  });

  it("trims linked starts with per-clip rates and rebases keyframes", () => {
    const value = project();
    value.clips = [
      clip({id: "video", linkedGroupId: "av", playbackRate: 2, keyframes: [{id: "key", property: "transform.opacity", frame: 8, value: 50, easing: "linear"}]}),
      clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av", playbackRate: 0.5}),
    ];
    const result = successful(trimClip(value, {clipId: "video", edge: "start", deltaFrames: 4}));
    expect(result.project.clips.find((item) => item.id === "video")).toMatchObject({start: 4, duration: 16, sourceStart: 12});
    expect(result.project.clips.find((item) => item.id === "audio")).toMatchObject({start: 4, duration: 16, sourceStart: 6});
    expect(result.project.clips.find((item) => item.id === "video")?.keyframes[0].frame).toBe(4);
  });

  it("unlinks an intentional partial trim and leaves no false sync group", () => {
    const value = project();
    value.clips = [clip({linkedGroupId: "av"}), clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"})];
    const result = successful(trimClip(value, {clipId: "video", edge: "start", deltaFrames: 2, includeLinked: false}));
    expect(result.project.clips.find((item) => item.id === "video")?.linkedGroupId).toBeUndefined();
    expect(result.project.clips.find((item) => item.id === "audio")?.linkedGroupId).toBe("av");
  });

  it("ripple trims downstream linked media and rejects locked propagation", () => {
    const value = project();
    value.clips = [
      clip({id: "video", linkedGroupId: "av"}),
      clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"}),
      clip({id: "later-video", start: 20, linkedGroupId: "later"}),
      clip({id: "later-audio", kind: "audio", trackId: "a1", start: 20, linkedGroupId: "later"}),
    ];
    const result = successful(trimClip(value, {clipId: "video", edge: "end", deltaFrames: 5, ripple: true}));
    expect(result.project.clips.find((item) => item.id === "video")?.duration).toBe(25);
    expect(result.project.clips.find((item) => item.id === "later-video")?.start).toBe(25);
    expect(result.project.clips.find((item) => item.id === "later-audio")?.start).toBe(25);
    const locked = project();
    locked.clips = value.clips;
    const audioTrack = locked.tracks.find((track) => track.id === "a1");
    if (audioTrack) audioTrack.locked = true;
    expect(trimClip(locked, {clipId: "video", edge: "end", deltaFrames: 5, ripple: true})).toMatchObject({ok: false, error: {code: "TRACK_LOCKED"}});
  });

  it("clones clips deterministically while preserving internal links and transitions", () => {
    const value = project();
    const payload = [
      clip({id: "video", linkedGroupId: "av"}),
      clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"}),
      clip({id: "next", start: 20}),
    ];
    const transitions = [{id: "edit", fromClipId: "video", toClipId: "next", type: "cross-dissolve" as const, duration: 4}];
    const first = successful(cloneClips(value, {clips: payload, transitions, atFrame: 100, idBase: "paste"}));
    expect(first.createdClipIds).toEqual(["paste-video", "paste-audio", "paste-next"]);
    expect(first.project.clips.find((item) => item.id === "paste-video")?.linkedGroupId).toBe("paste-link-av");
    expect(first.project.clips.find((item) => item.id === "paste-audio")?.linkedGroupId).toBe("paste-link-av");
    expect(first.project.transitions).toEqual([expect.objectContaining({id: "paste-edit", fromClipId: "paste-video", toClipId: "paste-next"})]);
    const second = successful(cloneClips(first.project, {clips: payload, transitions, atFrame: 160, idBase: "paste"}));
    expect(second.createdClipIds).toEqual(["paste-video-2", "paste-audio-2", "paste-next-2"]);
  });

  it("inserts media and ripples destination content", () => {
    const value = project();
    value.media = [{id: "media", name: "Media", kind: "video", src: "/media.mp4", duration: 10, color: "#09f", binId: "bin-video"}];
    value.clips = [clip({id: "later", start: 20, duration: 10})];
    const result = successful(placeMedia(value, {mode: "insert", atFrame: 20, items: [{mediaId: "media", trackId: "v1"}], idBase: "insert"}));
    expect(result.project.clips.find((item) => item.id === "later")?.start).toBe(30);
    expect(result.project.clips.find((item) => item.id === "insert-media-1")).toMatchObject({start: 20, duration: 10, sourceMediaId: "media"});
  });

  it("uses explicit multi-track targets for insert ripple and rejects source overruns", () => {
    const value = project();
    value.media = [{id: "media", name: "Media", kind: "video", src: "/media.mp4", duration: 20, color: "#09f", binId: "bin-video"}];
    value.clips = [clip({id: "v1-later", start: 30, duration: 10}), clip({id: "v2-later", trackId: "v2", start: 30, duration: 10}), clip({id: "v3-later", trackId: "v3", start: 30, duration: 10})];
    const result = successful(placeMedia(value, {mode: "insert", atFrame: 20, items: [{mediaId: "media", trackId: "v1", sourceStart: 5, duration: 10}], rippleTrackIds: ["v1", "v2"], idBase: "three-point"}));
    expect(result.project.clips.find((item) => item.id === "v1-later")?.start).toBe(40);
    expect(result.project.clips.find((item) => item.id === "v2-later")?.start).toBe(40);
    expect(result.project.clips.find((item) => item.id === "v3-later")?.start).toBe(30);
    expect(result.project.clips.find((item) => item.id === "three-point-media-1")).toMatchObject({sourceStart: 5, duration: 10});
    expect(placeMedia(value, {mode: "overwrite", atFrame: 0, items: [{mediaId: "media", trackId: "v1", sourceStart: 15, duration: 10}], idBase: "bad-range"})).toMatchObject({ok: false, error: {code: "INVALID_SOURCE_RANGE"}});
  });

  it("overwrite placement resolves spanning and right-edge intersections", () => {
    const spanning = project();
    spanning.media = [{id: "media", name: "Media", kind: "video", src: "/media.mp4", duration: 10, color: "#09f", binId: "bin-video"}];
    spanning.clips = [clip({id: "long", duration: 40, keyframes: [{id: "right-key", property: "transform.opacity", frame: 25, value: 50, easing: "linear"}]})];
    const split = successful(placeMedia(spanning, {mode: "overwrite", atFrame: 10, items: [{mediaId: "media", trackId: "v1"}], idBase: "overwrite"}));
    expect(split.project.clips.find((item) => item.id === "long")).toMatchObject({start: 0, duration: 10});
    expect(split.project.clips.find((item) => item.id === "overwrite-long-overwrite-right")).toMatchObject({start: 20, duration: 20, sourceStart: 24});
    expect(split.project.clips.find((item) => item.id === "overwrite-long-overwrite-right")?.keyframes[0].frame).toBe(5);

    const rightEdge = project();
    rightEdge.media = spanning.media;
    rightEdge.clips = [clip({id: "right", start: 15, duration: 20})];
    const trimmed = successful(placeMedia(rightEdge, {mode: "overwrite", atFrame: 10, items: [{mediaId: "media", trackId: "v1"}], idBase: "overwrite"}));
    expect(trimmed.project.clips.find((item) => item.id === "right")).toMatchObject({start: 20, duration: 15, sourceStart: 9});
  });

  it("fails closed for insert straddlers and partial linked overwrites", () => {
    const value = project();
    value.media = [{id: "media", name: "Media", kind: "video", src: "/media.mp4", duration: 10, color: "#09f", binId: "bin-video"}];
    value.clips = [clip({id: "straddler", start: 5, duration: 20})];
    expect(placeMedia(value, {mode: "insert", atFrame: 10, items: [{mediaId: "media", trackId: "v1"}], idBase: "insert"})).toMatchObject({ok: false, error: {code: "PLACEMENT_CONFLICT"}});

    const linked = project();
    linked.media = value.media;
    linked.clips = [
      clip({id: "video", linkedGroupId: "av"}),
      clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"}),
    ];
    expect(placeMedia(linked, {mode: "overwrite", atFrame: 5, items: [{mediaId: "media", trackId: "v1"}], idBase: "overwrite"})).toMatchObject({ok: false, error: {code: "LINKED_OPERATION_CONFLICT"}});
  });

  it("preserves a new linked group for right survivors of a linked overwrite split", () => {
    const value = project();
    value.media = [
      {id: "video-media", name: "Video", kind: "video", src: "/video.mp4", duration: 5, color: "#09f", binId: "bin-video"},
      {id: "audio-media", name: "Audio", kind: "audio", src: "/audio.wav", duration: 5, color: "#0f9", binId: "bin-audio"},
    ];
    value.clips = [clip({id: "video", linkedGroupId: "av"}), clip({id: "audio", kind: "audio", trackId: "a1", linkedGroupId: "av"})];
    const result = successful(placeMedia(value, {
      mode: "overwrite",
      atFrame: 5,
      items: [{mediaId: "video-media", trackId: "v1"}, {mediaId: "audio-media", trackId: "a1"}],
      idBase: "overwrite",
    }));
    const videoRight = result.project.clips.find((item) => item.id === "overwrite-video-overwrite-right");
    const audioRight = result.project.clips.find((item) => item.id === "overwrite-audio-overwrite-right");
    expect(videoRight?.linkedGroupId).toBe("overwrite-av-overwrite-right");
    expect(audioRight?.linkedGroupId).toBe("overwrite-av-overwrite-right");
  });

  it("fails closed for malformed or unsupported command payloads", () => {
    const value = project();
    expect(executeTimelineCommand(value, {type: "move-clips", clipIds: null, deltaFrames: 1} as never)).toMatchObject({ok: false, error: {code: "INVALID_COMMAND"}});
    expect(executeTimelineCommand(value, {type: "trim-clip", clipId: "video", edge: "bogus", deltaFrames: 1} as never)).toMatchObject({ok: false, error: {code: "INVALID_COMMAND"}});
    expect(executeTimelineCommand(value, {type: "unknown"} as never)).toMatchObject({ok: false, error: {code: "INVALID_COMMAND"}});
    const malformedClip = {...clip()} as unknown as {keyframes?: EditorClip["keyframes"]};
    delete malformedClip.keyframes;
    expect(executeTimelineCommand(value, {type: "clone-clips", clips: [malformedClip], atFrame: 0, idBase: "x"} as never)).toMatchObject({ok: false, error: {code: "INVALID_COMMAND"}});
    expect(executeTimelineCommand(value, {type: "place-media", mode: "overwrite", atFrame: 0, idBase: "x", items: [{mediaId: "m", trackId: "v1", duration: "10"}]} as never)).toMatchObject({ok: false, error: {code: "INVALID_COMMAND"}});
    expect(executeTimelineCommand(value, {type: "clone-clips", clips: [{...clip(), playbackRate: "2"}], atFrame: 0, idBase: "x"} as never)).toMatchObject({ok: false, error: {code: "INVALID_COMMAND"}});
    const cyclicStyle = {...DEFAULT_TITLE_STYLE} as typeof DEFAULT_TITLE_STYLE & {self?: unknown};
    cyclicStyle.self = cyclicStyle;
    expect(executeTimelineCommand(value, {type: "clone-clips", clips: [{...clip({kind: "title"}), textStyle: cyclicStyle}], atFrame: 0, idBase: "x"} as never)).toMatchObject({ok: false, error: {code: "INVALID_COMMAND"}});
  });
});
