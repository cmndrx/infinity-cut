import {describe, expect, it} from "vitest";
import {effectMaskStyle, hasTargetMask} from "./EditorComposition";
import {createDefaultMask} from "./masks";
import {sampleProject} from "./project";

describe("effect-specific masking", () => {
  it("does not leak a target's masks into another effect", () => {
    const clip = structuredClone(sampleProject.clips[0]);
    clip.effects.maskEnabled = false;
    clip.effectMasks = [{...createDefaultMask("blur", "rectangle"), target: "blur"}];
    expect(hasTargetMask(clip, "blur")).toBe(true);
    expect(effectMaskStyle(clip, 0, "blur").maskImage).toContain("data:image/svg+xml");
    for (const target of ["color", "grain", "glow", "vignette"] as const) expect(effectMaskStyle(clip, 0, target)).toEqual({});
  });
  it("respects master bypass, disabled masks and legacy color-only masks", () => {
    const clip = structuredClone(sampleProject.clips[0]);
    clip.effects.maskEnabled = true;
    clip.effectMasks = [{...createDefaultMask("grain"), target: "grain", enabled: false}];
    expect(effectMaskStyle(clip, 0, "color").maskImage).toContain("radial-gradient");
    expect(effectMaskStyle(clip, 0, "grain")).toEqual({});
    clip.effects.enabled = false;
    expect(effectMaskStyle(clip, 0, "color")).toEqual({});
    expect(hasTargetMask(clip, "grain")).toBe(false);
  });
});
