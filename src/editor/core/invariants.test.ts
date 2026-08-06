import {describe, expect, it} from "vitest";
import {createBlankProject} from "../project-storage";
import type {EditorClip, EditorProject} from "../types";
import {DEFAULT_EFFECTS, DEFAULT_TRANSFORM} from "../types";
import {isClipCompatibleWithTrack, pruneInvalidTransitions, validateProjectInvariants} from "./invariants";

const clip = (updates: Partial<EditorClip> = {}): EditorClip => ({
  id: "clip",
  name: "Clip",
  kind: "video",
  trackId: "v1",
  start: 0,
  duration: 20,
  sourceStart: 0,
  color: "#fff",
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  audioMuted: false,
  transform: {...DEFAULT_TRANSFORM},
  effects: {...DEFAULT_EFFECTS},
  keyframes: [],
  ...updates,
});

const project = (): EditorProject => createBlankProject({name: "Core", width: 1920, height: 1080, fps: 30});

describe("timeline invariants", () => {
  it("accepts the supported clip-to-track mappings", () => {
    expect(isClipCompatibleWithTrack({kind: "video"}, {kind: "video"})).toBe(true);
    expect(isClipCompatibleWithTrack({kind: "title"}, {kind: "video"})).toBe(true);
    expect(isClipCompatibleWithTrack({kind: "audio"}, {kind: "audio"})).toBe(true);
    expect(isClipCompatibleWithTrack({kind: "caption"}, {kind: "caption"})).toBe(true);
    expect(isClipCompatibleWithTrack({kind: "audio"}, {kind: "video"})).toBe(false);
  });

  it("reports missing tracks, incompatible kinds, invalid ranges, duplicate ids, and invalid rates", () => {
    const value = project();
    value.clips = [
      clip({id: "duplicate", trackId: "missing", sourceStart: -1}),
      clip({id: "duplicate", kind: "audio", trackId: "v1", playbackRate: 20}),
    ];
    const result = validateProjectInvariants(value);
    expect(result.valid).toBe(false);
    expect(new Set(result.issues.map((issue) => issue.code))).toEqual(new Set([
      "DUPLICATE_CLIP_ID",
      "MISSING_TRACK",
      "INVALID_CLIP_RANGE",
      "INCOMPATIBLE_TRACK",
      "INVALID_PLAYBACK_RATE",
    ]));
  });

  it("prunes transitions that no longer join adjacent visual clips without mutating input", () => {
    const value = project();
    value.clips = [clip({id: "a"}), clip({id: "b", start: 20})];
    value.transitions = [
      {id: "valid", fromClipId: "a", toClipId: "b", type: "cross-dissolve", duration: 8},
      {id: "missing", fromClipId: "a", toClipId: "gone", type: "cross-dissolve", duration: 8},
    ];
    const result = pruneInvalidTransitions(value);
    expect(result.prunedTransitionIds).toEqual(["missing"]);
    expect(result.project.transitions.map((transition) => transition.id)).toEqual(["valid"]);
    expect(value.transitions).toHaveLength(2);
  });

  it("rejects invalid fades, keyframes, markers, numeric state, and project ranges", () => {
    const value = project();
    value.durationInFrames = 20;
    value.clips = [clip({
      start: 10,
      duration: 20,
      fadeIn: 12,
      fadeOut: 12,
      transform: {...DEFAULT_TRANSFORM, x: Number.NaN},
      keyframes: [{id: "bad", property: "transform.opacity", frame: 20, value: Number.NaN, easing: "linear"}],
    })];
    value.markers = [{id: "marker", frame: 20, label: "Outside", color: "#fff"}];
    const result = validateProjectInvariants(value);
    expect(result.valid).toBe(false);
    expect(new Set(result.issues.map((issue) => issue.code))).toEqual(new Set([
      "INVALID_CLIP_RANGE",
      "INVALID_CLIP_STATE",
      "INVALID_KEYFRAME",
      "INVALID_MARKER",
    ]));
  });

  it("rejects invalid runtime enums, effect types, duplicate keyframe positions, booleans, and transitions per edit", () => {
    const value = project();
    value.clips = [
      clip({
        id: "first",
        duration: 15,
        effects: {...DEFAULT_EFFECTS, brightness: "bright" as unknown as number, enabled: "false" as unknown as boolean},
        audioMuted: "false" as unknown as boolean,
        keyframes: [
          {id: "one", property: "transform.opacity", frame: 2, value: 10, easing: "linear"},
          {id: "two", property: "transform.opacity", frame: 2, value: 20, easing: "linear"},
        ],
      }),
      clip({id: "second", start: 10, duration: 10}),
    ];
    (value.tracks[0] as unknown as {kind: string}).kind = "unknown";
    value.tracks[0].locked = "false" as unknown as boolean;
    value.transitions = [{id: "bad-type", fromClipId: "first", toClipId: "second", type: "morph" as never, duration: 4}];
    const result = validateProjectInvariants(value);
    expect(result.valid).toBe(false);
    const codes = result.issues.map((issue) => issue.code);
    for (const code of ["INVALID_TRACK", "INVALID_CLIP_STATE", "INVALID_KEYFRAME", "INVALID_TRANSITION"]) {
      expect(codes).toContain(code);
    }
  });

  it("rejects multiple transitions on the same edit", () => {
    const value = project();
    value.clips = [clip({id: "first"}), clip({id: "second", start: 20})];
    value.transitions = [
      {id: "one", fromClipId: "first", toClipId: "second", type: "cross-dissolve", duration: 4},
      {id: "two", fromClipId: "first", toClipId: "second", type: "dip-to-black", duration: 4},
    ];
    expect(validateProjectInvariants(value).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "INVALID_TRANSITION", entityId: "two"}),
    ]));
  });

  it("requires non-empty string IDs and references", () => {
    const value = project();
    value.clips = [clip({id: "first"}), clip({id: "second", start: 20})];
    (value.tracks[0] as unknown as {id: number}).id = 42;
    (value.clips[0] as unknown as {id: object}).id = {};
    value.transitions = [{id: "", fromClipId: "first", toClipId: "second", type: "cross-dissolve", duration: 4}];
    value.markers = [{id: "", frame: 1, label: "Bad", color: "#fff"}];
    const codes = validateProjectInvariants(value).issues.map((issue) => issue.code);
    expect(codes).toContain("INVALID_TRACK");
    expect(codes).toContain("INVALID_CLIP_KIND");
    expect(codes).toContain("INVALID_TRANSITION");
    expect(codes).toContain("INVALID_MARKER");
  });

  it("validates media, bin, and clip source references", () => {
    const value = project();
    value.mediaBins = [{id: "bin", name: "Bin"}];
    value.media = [{id: "media", name: "Media", kind: "video", src: "/media.mp4", duration: 20, color: "#fff", binId: "missing"}];
    value.clips = [clip({sourceMediaId: "missing-media"})];
    const codes = validateProjectInvariants(value).issues.map((issue) => issue.code);
    expect(codes).toContain("INVALID_MEDIA_REFERENCE");

    (value.mediaBins[0] as unknown as {id: number}).id = 1;
    (value.media[0] as unknown as {id: object}).id = {};
    expect(validateProjectInvariants(value).issues.map((issue) => issue.code)).toContain("INVALID_MEDIA");
  });
});
