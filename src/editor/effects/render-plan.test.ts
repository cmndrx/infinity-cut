import {describe, expect, it} from "vitest";
import {BUILTIN_VISUAL_EFFECTS, createVisualEffectInstance, type VisualEffectInstance} from "./registry";
import {buildEffectRenderPlan, deterministicEffectNoise} from "./render-plan";

describe("effect render plan", () => {
  it("preserves filter order and produces deterministic motion", () => {
    const stack = [
      createVisualEffectInstance("dc.effect.brightness", "a", {amount: .2}),
      createVisualEffectInstance("dc.effect.blur", "b", {radius: 4}),
      createVisualEffectInstance("dc.effect.wave", "c", {amplitude: 12, frequency: 3, phase: .2}),
    ];
    const plan = buildEffectRenderPlan(stack, 24);
    expect(plan.filter).toBe("brightness(1.2) blur(4px)");
    expect(plan.transform).toContain("translateX(");
    expect(buildEffectRenderPlan(stack, 24)).toEqual(plan);
  });

  it("routes overlay effects and fails visibly for missing effects", () => {
    const stack: VisualEffectInstance[] = [
      createVisualEffectInstance("dc.effect.scanlines", "scan"),
      {id: "gone", descriptorId: "plugin.removed", descriptorVersion: 1, enabled: true, parameters: {}},
    ];
    const plan = buildEffectRenderPlan(stack, 0);
    expect(plan.overlays.map((item) => item.kind)).toEqual(["scanlines"]);
    expect(plan.errors).toEqual(["Missing effect: plugin.removed"]);
  });

  it("uses stable seeded values", () => {
    expect(deterministicEffectNoise(7, 18, 2)).toBe(deterministicEffectNoise(7, 18, 2));
    expect(deterministicEffectNoise(7, 19, 2)).not.toBe(deterministicEffectNoise(7, 18, 2));
  });

  it("has a deterministic render path for every built-in effect", () => {
    const stack = BUILTIN_VISUAL_EFFECTS.map((descriptor, index) => createVisualEffectInstance(descriptor.id, `fx-${index}`));
    expect(buildEffectRenderPlan(stack, 12).errors).toEqual([]);
  });
});
