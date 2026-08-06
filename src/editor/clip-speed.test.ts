import {describe, expect, it} from "vitest";
import {applyClipSpeed, getClipSourceSpan, playbackRateForDuration, retimeClipForPlaybackRate} from "./clip-speed";
import {createBlankProject} from "./project-storage";
import type {EditorClip} from "./types";
import {DEFAULT_EFFECTS, DEFAULT_TRANSFORM} from "./types";

const makeClip = (updates: Partial<EditorClip> = {}): EditorClip => ({
  id: "clip", name: "Clip", kind: "video", trackId: "v1", start: 30, duration: 120, sourceStart: 12,
  src: "/clip.mp4", color: "#fff", volume: 1, fadeIn: 12, fadeOut: 24, audioMuted: false,
  transform: {...DEFAULT_TRANSFORM}, effects: {...DEFAULT_EFFECTS},
  keyframes: [{id: "key", property: "transform.opacity", frame: 60, value: 50, easing: "linear"}],
  playbackRate: 1, preservePitch: true, ...updates,
});

describe("clip speed", () => {
  it("changes timeline duration while preserving the consumed source range", () => {
    const original = makeClip();
    const retimed = retimeClipForPlaybackRate(original, 2);

    expect(retimed).toMatchObject({playbackRate: 2, duration: 60, fadeIn: 6, fadeOut: 12});
    expect(retimed.keyframes[0].frame).toBe(30);
    expect(getClipSourceSpan(retimed)).toBe(getClipSourceSpan(original));
  });

  it("derives speed from an entered duration", () => {
    expect(playbackRateForDuration(makeClip(), 240)).toBe(0.5);
    expect(playbackRateForDuration(makeClip({playbackRate: 2}), 60)).toBe(4);
  });

  it("optionally ripple shifts later clips on the same track", () => {
    const project = createBlankProject({name: "Speed", width: 1920, height: 1080, fps: 30});
    project.clips = [makeClip(), makeClip({id: "later", start: 150, duration: 90}), makeClip({id: "other", trackId: "v2", start: 150})];

    const changed = applyClipSpeed(project, "clip", 2, {ripple: true, preservePitch: false});
    expect(changed.clips.find((clip) => clip.id === "clip")).toMatchObject({duration: 60, playbackRate: 2, preservePitch: false});
    expect(changed.clips.find((clip) => clip.id === "later")?.start).toBe(90);
    expect(changed.clips.find((clip) => clip.id === "other")?.start).toBe(150);
  });
});
