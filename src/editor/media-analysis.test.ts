import {describe, expect, it} from "vitest";
import {normalizeMediaAnalysis, sampleWaveform, waveformForClip} from "./media-analysis";
import type {EditorClip, ProjectMedia} from "./types";
import {DEFAULT_EFFECTS, DEFAULT_TRANSFORM} from "./types";

const clip = (): EditorClip => ({id: "c", name: "Audio", kind: "audio", trackId: "a1", start: 0, duration: 25, sourceStart: 25, src: "/a.wav", color: "#fff", volume: 1, fadeIn: 0, fadeOut: 0, audioMuted: false, playbackRate: 2, transform: {...DEFAULT_TRANSFORM}, effects: {...DEFAULT_EFFECTS}, keyframes: [], sourceMediaId: "m"});

describe("media analysis", () => {
  it("normalizes bounded persistent analysis metadata", () => {
    expect(normalizeMediaAnalysis({id: "a".repeat(24), status: "ready", waveform: [-1, .5, 2]})).toMatchObject({waveform: [0, .5, 1]});
    expect(normalizeMediaAnalysis({id: "bad", status: "ready"})).toBeUndefined();
  });

  it("resamples the source range used by a retimed clip", () => {
    const media = {id: "m", duration: 100, durationInSeconds: 4, analysis: {id: "b".repeat(24), status: "ready", waveform: [0, .1, .2, .3, .4, .5, .6, .7]}, name: "A", kind: "audio", src: "/a.wav", color: "#fff", binId: "audio"} satisfies ProjectMedia;
    expect(waveformForClip(clip(), media, 25, 2)).toEqual([.3, .5]);
    expect(sampleWaveform([], 0, 1)).toEqual([]);
  });
});
