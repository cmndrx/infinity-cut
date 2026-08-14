import {describe, expect, it} from "vitest";
import {buildFfmpegAudioGraph} from "./ffmpeg-filter-graph";
import {validateAudioMix, type AudioMix} from "./model";

const mix = (): AudioMix => ({
  fps: 30,
  durationInFrames: 300,
  sampleRate: 48_000,
  masterBusId: "master",
  buses: [
    {id: "music", name: "Music", outputBusId: "master", gainDb: -1, pan: 0, muted: false, processors: []},
    {id: "master", name: "Master", outputBusId: null, gainDb: 0, pan: 0, muted: false, processors: [{id: "limit", type: "limiter", enabled: true, ceilingDb: -1, attackMs: 5, releaseMs: 50}]},
  ],
  tracks: [{id: "a1", busId: "music", gainDb: -3, pan: 0.25, muted: false, solo: false, processors: [{id: "comp", type: "compressor", enabled: true, thresholdDb: -18, ratio: 4, attackMs: 10, releaseMs: 120, kneeDb: 6, makeupDb: 2}]}],
  clips: [{
    id: "clip1", inputIndex: 0, audioStreamIndex: 1, trackId: "a1", startFrame: 30, durationFrames: 120, sourceStartFrame: 15,
    playbackRate: 4, gainDb: -6, pan: -0.5, fadeInFrames: 6, fadeOutFrames: 12, muted: false,
    processors: [{id: "gate", type: "noise-gate", enabled: true, thresholdDb: -45, rangeDb: -60, attackMs: 5, releaseMs: 100}],
  }],
});

describe("professional audio model", () => {
  it("validates processor ranges and rejects cyclic buses", () => {
    expect(validateAudioMix(mix())).toEqual({valid: true, issues: []});
    const cyclic = mix();
    cyclic.buses[1].outputBusId = "music";
    expect(validateAudioMix(cyclic).issues.some((issue) => issue.message.includes("cycle"))).toBe(true);
    const invalid = mix();
    invalid.clips[0].pan = 2;
    expect(validateAudioMix(invalid).valid).toBe(false);
  });

  it("generates a stable, labelled FFmpeg graph for clips, tracks, submixes, and master", () => {
    const first = buildFfmpegAudioGraph(mix());
    const second = buildFfmpegAudioGraph(mix());
    expect(first).toEqual(second);
    expect(first.outputLabel).toBe("dc_bus_master");
    expect(first.filterComplex).toContain("[0:a:1]atrim=start=0.5:duration=16,asetpts=PTS-STARTPTS,atempo=2,atempo=2");
    expect(first.filterComplex).toContain("agate=threshold=-45dB");
    expect(first.filterComplex).toContain("acompressor=threshold=-18dB");
    expect(first.filterComplex).toContain("alimiter=limit=0.891251");
    expect(first.filterComplex).toContain("[dc_bus_music]");
    expect(first.filterComplex).toContain("pan=stereo|c0=1*c0|c1=1*c1[dc_bus_master]");
    expect(first.filterComplex).not.toMatch(/[\n\r]/);
  });

  it("honors track solo by silencing non-solo track outputs", () => {
    const value = mix();
    value.tracks.push({id: "a2", busId: "master", gainDb: 0, pan: 0, muted: false, solo: true, processors: []});
    const graph = buildFfmpegAudioGraph(value).filterComplex;
    expect(graph).toMatch(/\[dc_track_mix_a1\][^;]*volume=0,/);
  });
});
