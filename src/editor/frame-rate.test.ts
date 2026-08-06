import {describe, expect, it} from "vitest";
import {conformMediaToFrameRate, formatFrameRate, frameRatesMatch, normalizeFrameRate, retimeProjectForFrameRate} from "./frame-rate";
import {createBlankProject} from "./project-storage";
import {DEFAULT_EFFECTS, DEFAULT_TRANSFORM} from "./types";

describe("frame-rate conformance", () => {
  it("normalizes common fractional video rates", () => {
    expect(normalizeFrameRate(29.97002997)).toBe(29.97);
    expect(normalizeFrameRate(23.976023)).toBe(23.976);
    expect(formatFrameRate(29.97)).toBe("29.97");
    expect(frameRatesMatch(29.97, 29.97003)).toBe(true);
  });

  it("retimes sequence data without changing its real-time positions", () => {
    const project = createBlankProject({name: "30 fps", width: 1920, height: 1080, fps: 30});
    project.durationInFrames = 300;
    project.media = [{id: "m1", name: "Clip", kind: "video", src: "/clip.mp4", duration: 150, durationInSeconds: 5, fps: 24, color: "#fff", binId: "bin-video"}];
    project.clips = [{
      id: "c1", name: "Clip", kind: "video", trackId: "v1", start: 60, duration: 150, sourceStart: 30, src: "/clip.mp4", color: "#fff", volume: 1,
      fadeIn: 15, fadeOut: 15, audioMuted: false, transform: {...DEFAULT_TRANSFORM}, effects: {...DEFAULT_EFFECTS},
      keyframes: [{id: "k1", property: "transform.opacity", frame: 30, value: 50, easing: "linear"}], sourceMediaId: "m1",
    }];
    project.markers = [{id: "marker", frame: 90, label: "Beat", color: "#fff"}];
    project.transitions = [{id: "t1", fromClipId: "a", toClipId: "b", type: "cross-dissolve", duration: 30}];

    const retimed = retimeProjectForFrameRate(project, 24);
    expect(retimed.fps).toBe(24);
    expect(retimed.durationInFrames).toBe(240);
    expect(retimed.media[0].duration).toBe(120);
    expect(retimed.clips[0]).toMatchObject({start: 48, duration: 120, sourceStart: 24, fadeIn: 12, fadeOut: 12});
    expect(retimed.clips[0].keyframes[0].frame).toBe(24);
    expect(retimed.markers[0].frame).toBe(72);
    expect(retimed.transitions[0].duration).toBe(24);
  });

  it("recalculates imported duration from seconds", () => {
    const item = {id: "m1", name: "Clip", kind: "video" as const, src: "/clip.mp4", duration: 300, durationInSeconds: 10, fps: 24, color: "#fff", binId: "bin-video"};
    expect(conformMediaToFrameRate(item, 24).duration).toBe(240);
  });
});
