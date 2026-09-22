import {execFileSync} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {sampleProject} from "../src/editor/project";
import {sequenceSnapshot} from "../src/editor/sequences";
import {buildProjectAudioMix} from "../src/editor/audio/project-audio";
import {createProjectAudioRenderer} from "./project-audio-renderer";

const available = (() => { try { execFileSync("ffmpeg", ["-version"], {stdio: "ignore"}); execFileSync("ffprobe", ["-version"], {stdio: "ignore"}); return true; } catch { return false; } })();
const fixture = () => {
  const project = structuredClone(sampleProject);
  project.activeSequenceId = "root";
  project.sequences = [];
  project.fps = 30;
  project.durationInFrames = 60;
  project.tracks = [{id: "a1", name: "A1", kind: "audio", muted: false, hidden: false, locked: false, solo: false, volume: 1}];
  project.audioSettings = {sampleRate: 48_000, masterBusId: "master", buses: [{id: "master", name: "Master", outputBusId: null, gainDb: 0, pan: 0, muted: false, processors: []}]};
  project.clips = [{...project.clips.find((clip) => clip.kind === "audio")!, id: "tone", trackId: "a1", src: "/tone.wav", start: 0, duration: 60, sourceStart: 0, playbackRate: 1, volume: 1, fadeIn: 0, fadeOut: 0, audioMuted: false, audioProcessors: [], keyframes: []}];
  return project;
};

describe("audio export contract", () => {
  it("retains volume keyframes and the pitch switch", () => {
    const project = fixture();
    project.clips[0].preservePitch = false;
    project.clips[0].keyframes = [{id: "k", property: "audio.volume", frame: 15, value: 0.5, easing: "ease-in-out"}];
    const clip = buildProjectAudioMix(project, () => ({inputIndex: 0})).clips[0];
    expect(clip.preservePitch).toBe(false);
    expect(clip.volumeKeyframes).toEqual([{frame: 15, value: 0.5, easing: "ease-in-out"}]);
  });
  it("does not silence embedded video audio when an audio track is soloed", () => {
    const project = fixture();
    project.tracks[0].solo = true;
    project.tracks.push({...project.tracks[0], id: "v1", kind: "video", solo: false});
    project.clips.push({...project.clips[0], id: "video", kind: "video", trackId: "v1"});
    expect(buildProjectAudioMix(project, () => ({inputIndex: 0})).tracks.find((track) => track.id === "v1")?.muted).toBe(false);
  });
});

describe.skipIf(!available)("real audio exports", () => {
  let root: string;
  let render: ReturnType<typeof createProjectAudioRenderer>;
  let count = 0;
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "directors-audio-render-"));
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", path.join(root, "tone.wav")]);
    render = createProjectAudioRenderer(() => path.join(root, "tone.wav"));
  });
  afterAll(() => { if (root) rmSync(root, {recursive: true, force: true}); });
  const output = async (project: ReturnType<typeof fixture>, range: [number, number] | null = null) => {
    const file = path.join(root, `export-${count++}.wav`);
    await render({project, output: file, frameRange: range, signal: new AbortController().signal, audioCodec: "pcm_s24le"});
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], {maxBuffer: 4_000_000});
    return Array.from({length: raw.length / 4}, (_, i) => raw.readFloatLE(i * 4));
  };
  const rms = (pcm: number[], from: number, to: number) => {
    const values = pcm.slice(Math.round(from * 48000), Math.round(to * 48000));
    return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  };
  const frequency = (pcm: number[]) => {
    const values = pcm.slice(12000, 60000);
    return values.reduce((sum, value, i) => sum + (i > 0 && values[i - 1] <= 0 && value > 0 ? 1 : 0), 0);
  };
  it("exports eased gain automation instead of static clip gain", async () => {
    const project = fixture();
    project.clips[0].volume = 0; // Automation replaces, rather than multiplies, static gain.
    project.clips[0].keyframes = [
      {id: "a", property: "audio.volume", frame: 0, value: 0, easing: "linear"},
      {id: "b", property: "audio.volume", frame: 30, value: 1, easing: "ease-in-out"},
      {id: "c", property: "audio.volume", frame: 60, value: 0, easing: "linear"},
    ];
    const pcm = await output(project);
    expect(pcm.length / 48000).toBeCloseTo(2, 3);
    expect(rms(pcm, .9, 1)).toBeGreaterThan(rms(pcm, .02, .12) * 10);
    const ratio = rms(pcm, .24, .28) / rms(pcm, .9, 1);
    expect(ratio).toBeGreaterThan(.10);
    expect(ratio).toBeLessThan(.22); // Smoothstep, not the .25 linear ramp.
  });
  it("preserves pitch when enabled and shifts pitch when disabled", async () => {
    const project = fixture();
    project.clips[0].playbackRate = 2;
    project.clips[0].preservePitch = true;
    const preserved = await output(project);
    project.clips[0].preservePitch = false;
    const shifted = await output(project);
    expect(Math.abs(frequency(preserved) - 440)).toBeLessThan(4);
    expect(Math.abs(frequency(shifted) - 880)).toBeLessThan(4);
    expect(preserved.length).toBe(96000);
    expect(shifted.length).toBe(96000);
  });
  it("renders repeated, trimmed nested sequences with child and parent gain and trailing silence", async () => {
    const project = fixture();
    const child = sequenceSnapshot(project);
    child.id = "child";
    child.clips[0].start = 15;
    child.clips[0].duration = 15;
    child.tracks[0].volume = .5;
    project.sequences = [child];
    project.durationInFrames = 90;
    project.tracks[0].volume = .5;
    project.clips = [{...project.clips[0], id: "nest", kind: "sequence", src: undefined, nestedSequenceId: "child", start: 15, sourceStart: 15, duration: 45, volume: .5}];
    project.clips.push({...project.clips[0], id: "repeat", start: 60, duration: 30});
    const childPcm = await output({...project, ...child, activeSequenceId: "child"});
    expect(rms(childPcm, .6, .9)).toBeGreaterThan(.04);
    const pcm = await output(project);
    expect(pcm.length).toBe(144000);
    expect(rms(pcm, .1, .4)).toBeLessThan(.00001);
    expect(rms(pcm, .6, .9)).toBeGreaterThan(.005);
    expect(rms(pcm, .6, .9)).toBeLessThan(.015);
    expect(rms(pcm, 1.2, 1.7)).toBeLessThan(.00001);
    expect(rms(pcm, 2.1, 2.4)).toBeCloseTo(rms(pcm, .6, .9), 4);
    project.tracks[0].muted = true;
    expect(rms(await output(project), .6, .9)).toBeLessThan(.00001);
  });
  it("exports a selected range without restarting its automation clock", async () => {
    const project = fixture();
    project.clips[0].keyframes = [{id: "a", property: "audio.volume", frame: 0, value: 0, easing: "linear"}, {id: "b", property: "audio.volume", frame: 30, value: 1, easing: "linear"}];
    const pcm = await output(project, [30, 44]);
    expect(pcm.length).toBe(24000);
    expect(rms(pcm, .05, .4)).toBeGreaterThan(.06);
  });
  it("rejects cyclic and unsupported retimed nests rather than exporting a misleading mix", async () => {
    const project = fixture();
    const child = sequenceSnapshot(project);
    child.id = "child";
    project.sequences = [child];
    project.clips = [{...project.clips[0], kind: "sequence", src: undefined, nestedSequenceId: "child", playbackRate: 2}];
    await expect(output(project)).rejects.toThrow("100% speed");
    project.clips[0].playbackRate = 1;
    child.clips = [{...project.clips[0], nestedSequenceId: "root"}];
    await expect(output(project)).rejects.toThrow("cycle");
  });
});
