import {describe, expect, it} from "vitest";
import {BUILTIN_TRANSITIONS, BUILTIN_VISUAL_EFFECTS, createVisualEffectInstance, listVisualEffects, validateVisualEffectInstance} from "./registry";

describe("visual effects registry", () => {
  it("provides a broader unique built-in effects and transitions catalog", () => {
    expect(BUILTIN_VISUAL_EFFECTS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(BUILTIN_VISUAL_EFFECTS.map((effect) => effect.id)).size).toBe(BUILTIN_VISUAL_EFFECTS.length);
    expect(BUILTIN_TRANSITIONS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(BUILTIN_TRANSITIONS.map((transition) => transition.id)).size).toBe(BUILTIN_TRANSITIONS.length);
    expect(listVisualEffects("blur").map((effect) => effect.name)).toEqual(expect.arrayContaining(["Gaussian Blur", "Progressive Blur", "Zoom Blur"]));
  });

  it("creates fully defaulted typed instances and rejects unknown parameters", () => {
    const effect = createVisualEffectInstance("dc.effect.chromatic-aberration", "fx1", {amount: 12});
    expect(effect.parameters).toEqual({amount: 12, radial: false});
    expect(validateVisualEffectInstance(effect)).toBe(true);
    expect(validateVisualEffectInstance({...effect, parameters: {...effect.parameters, surprise: 1}})).toBe(false);
    expect(() => createVisualEffectInstance("dc.effect.blur", "fx2", {radius: 101})).toThrow("Invalid parameters");
  });
});
