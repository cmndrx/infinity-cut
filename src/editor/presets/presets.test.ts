import {describe, expect, it} from "vitest";
import {applyAudioPreset, applyEffectPreset, importEditorPreset, type AudioPreset, type EffectPreset} from "./presets";

const visualPreset: EffectPreset = {
  schemaVersion: 1,
  kind: "visual-effects",
  id: "preset.neon",
  name: "Neon",
  effects: [{templateId: "glow", descriptorId: "dc.effect.glow", parameters: {radius: 18, intensity: 0.8}}],
  automation: [{templateId: "glow", parameter: "intensity", frame: 20, value: 1.2, interpolation: "bezier"}],
};

describe("safe reusable presets", () => {
  it("imports declarative presets and remaps effect automation ids", () => {
    const imported = importEditorPreset(JSON.stringify(visualPreset));
    expect(imported).toEqual(visualPreset);
    const applied = applyEffectPreset(visualPreset, (templateId) => `new-${templateId}`);
    expect(applied.effects[0].id).toBe("new-glow");
    expect(applied.automation[0]).toMatchObject({effectInstanceId: "new-glow", parameter: "intensity"});
  });

  it("copies audio processor presets with fresh ids", () => {
    const preset: AudioPreset = {schemaVersion: 1, kind: "audio-processors", id: "preset.voice", name: "Voice", processors: [{id: "compressor", type: "compressor", enabled: true, thresholdDb: -20, ratio: 3, attackMs: 8, releaseMs: 100, kneeDb: 4, makeupDb: 2}]};
    expect(applyAudioPreset(preset, (id) => `copy-${id}`)[0].id).toBe("copy-compressor");
  });

  it("rejects executable, prototype-polluting, oversized, and invalid parameter data", () => {
    expect(() => importEditorPreset('{"schemaVersion":1,"kind":"visual-effects","id":"preset.bad","name":"Bad","effects":[],"automation":[],"__proto__":{}}')).toThrow("invalid");
    expect(() => importEditorPreset({...visualPreset, script: "alert(1)"})).toThrow("invalid");
    expect(() => importEditorPreset({...visualPreset, effects: [{...visualPreset.effects[0], parameters: {radius: 1_000, intensity: 1}}]})).toThrow("invalid");
    expect(() => importEditorPreset("x".repeat(1_000_001))).toThrow("1 MB");
  });
});
