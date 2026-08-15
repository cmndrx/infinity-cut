import {describe, expect, it} from "vitest";
import {createBlankProject, normalizeProject} from "../project-storage";
import {buildProjectAudioMix, DEFAULT_AUDIO_PROJECT_SETTINGS, normalizeProjectAudioSettings} from "./project-audio";

describe("project audio integration", () => {
  it("migrates projects and tracks to a safe professional mix", () => {
    const legacy = createBlankProject({name: "Legacy audio", width: 1920, height: 1080, fps: 30});
    delete legacy.audioSettings;
    for (const track of legacy.tracks) {
      delete track.audioPan;
      delete track.audioBusId;
      delete track.audioProcessors;
    }
    const migrated = normalizeProject(legacy);
    expect(migrated.audioSettings).toEqual(DEFAULT_AUDIO_PROJECT_SETTINGS);
    expect(migrated.tracks.every((track) => track.audioPan === 0 && track.audioBusId === "master" && track.audioProcessors?.length === 0)).toBe(true);
  });

  it("fails closed to defaults for invalid and cyclic bus settings", () => {
    expect(normalizeProjectAudioSettings({sampleRate: 48_000, masterBusId: "master", buses: [
      {id: "master", name: "Master", outputBusId: null, gainDb: 0, pan: 0, muted: false, processors: []},
      {id: "loop-a", name: "Loop A", outputBusId: "loop-b", gainDb: 0, pan: 0, muted: false, processors: []},
      {id: "loop-b", name: "Loop B", outputBusId: "loop-a", gainDb: 0, pan: 0, muted: false, processors: []},
    ]})).toEqual(DEFAULT_AUDIO_PROJECT_SETTINGS);
  });

  it("builds one deterministic preview/export contract from project settings", () => {
    const project = createBlankProject({name: "Mix", width: 1920, height: 1080, fps: 30});
    const a1 = project.tracks.find((track) => track.id === "a1")!;
    a1.volume = 0.5;
    a1.audioPan = -0.25;
    a1.audioBusId = "dialogue";
    project.clips.push({
      id: "voice", name: "Voice", kind: "audio", trackId: "a1", start: 30, duration: 90, sourceStart: 0, src: "/voice.webm", color: "#fff",
      volume: 1, fadeIn: 3, fadeOut: 6, audioMuted: false, audioPan: 0.2, audioProcessors: [], transform: {x: 0, y: 0, scale: 100, rotation: 0, opacity: 100},
      effects: {enabled: true, colorEnabled: true, blurEnabled: true, vignetteEnabled: true, grainEnabled: true, glowEnabled: true, brightness: 100, contrast: 100, saturation: 100, blur: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, hue: 0, fade: 0, sharpen: 0, vignette: 0, grain: 0, glow: 0, look: "Custom", maskEnabled: false, maskInverted: false, maskX: 50, maskY: 50, maskSize: 65, maskFeather: 35}, keyframes: [],
    });
    const first = buildProjectAudioMix(project, (id) => id === "voice" ? {inputIndex: 2} : undefined);
    expect(buildProjectAudioMix(project, (id) => id === "voice" ? {inputIndex: 2} : undefined)).toEqual(first);
    expect(first.tracks.find((track) => track.id === "a1")).toEqual(expect.objectContaining({busId: "dialogue", pan: -0.25, gainDb: expect.closeTo(-6.0206, 3)}));
    expect(first.clips[0]).toEqual(expect.objectContaining({id: "voice", inputIndex: 2, pan: 0.2, fadeInFrames: 3, fadeOutFrames: 6}));
  });
});
