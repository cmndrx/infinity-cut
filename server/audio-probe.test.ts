import {execFileSync} from "node:child_process";
import {mkdtempSync, mkdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {hasAudioStream} from "./audio-probe";
import {resolveMediaSourcePath} from "./media-source";
import {sampleProject} from "../src/editor/project";
import {buildProjectAudioMix} from "../src/editor/audio/project-audio";
import {buildFfmpegAudioGraph} from "../src/editor/audio/ffmpeg-filter-graph";

const available = (() => { try { execFileSync("ffmpeg", ["-version"], {stdio: "ignore"}); execFileSync("ffprobe", ["-version"], {stdio: "ignore"}); return true; } catch { return false; } })();

describe.skipIf(!available)("real FFmpeg media probing", () => {
  it("finds bundled audio and distinguishes a silent video from missing media", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "directors-audio-probe-"));
    try {
      mkdirSync(path.join(root, "public/audio"), {recursive: true});
      const audio = resolveMediaSourcePath("/audio/tone.wav", root, path.join(root, "media"));
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", audio]);
      const video = path.join(root, "silent.mp4");
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=size=32x32:duration=0.2", "-an", video]);
      const signal = new AbortController().signal;
      expect(await hasAudioStream(audio, signal)).toBe(true);
      const project = structuredClone(sampleProject);
      project.fps = 30;
      project.durationInFrames = 6;
      project.clips = [{...project.clips.find((clip) => clip.kind === "audio")!, id: "tone", src: "/audio/tone.wav", start: 0, sourceStart: 0, duration: 6, volume: 1, fadeIn: 0, fadeOut: 0, audioMuted: false}];
      const graph = buildFfmpegAudioGraph(buildProjectAudioMix(project, () => ({inputIndex: 0})));
      const output = path.join(root, "export.wav");
      execFileSync("ffmpeg", ["-v", "error", "-i", audio, "-filter_complex", graph.filterComplex, "-map", `[${graph.outputLabel}]`, "-c:a", "pcm_s16le", output]);
      const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=channels,sample_rate", "-of", "json", output], {encoding: "utf8"}));
      expect(Number(info.format.duration)).toBeCloseTo(0.2, 2);
      expect(info.streams[0].channels).toBe(2);
      expect(Number(info.streams[0].sample_rate)).toBe(48_000);
      const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "s16le", "pipe:1"]);
      let peak = 0;
      for (let offset = 0; offset < pcm.length; offset += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)));
      expect(peak).toBeGreaterThan(100);
      expect(await hasAudioStream(video, signal)).toBe(false);
      await expect(hasAudioStream(path.join(root, "missing.wav"), signal)).rejects.toThrow("Relink");
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
  it("rejects already cancelled work", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(hasAudioStream("unused.wav", controller.signal)).rejects.toThrow("cancelled");
  });
});
