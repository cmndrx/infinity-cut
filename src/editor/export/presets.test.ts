import {describe, expect, it} from "vitest";
import {BUILT_IN_EXPORT_PRESETS, normalizeExportPreset} from "./presets";

describe("export presets", () => {
  it("ships unique professional defaults", () => {
    expect(new Set(BUILT_IN_EXPORT_PRESETS.map((preset) => preset.id)).size).toBe(BUILT_IN_EXPORT_PRESETS.length);
    expect(BUILT_IN_EXPORT_PRESETS.some((preset) => preset.format === "prores")).toBe(true);
    expect(BUILT_IN_EXPORT_PRESETS.some((preset) => preset.format === "png-sequence")).toBe(true);
  });

  it("normalizes untrusted custom presets", () => {
    expect(normalizeExportPreset({name: "My preset", format: "prores", quality: "high", resolution: "720p"})).toMatchObject({name: "My preset", format: "prores", quality: "high", resolution: "720p", builtIn: false});
    expect(normalizeExportPreset({format: "invalid" as "mp4"})).toMatchObject({format: "mp4", quality: "standard", resolution: "source"});
  });
});
