import {describe, expect, it} from "vitest";
import {combinedMaskAlphaAt, createDefaultMask, getAnimatedMaskProperty, maskAlphaAt, upsertMaskKeyframe} from "./masks";

describe("multi-mask math", () => {
  it("evaluates hard rectangle and ellipse boundaries", () => {
    const rectangle = {...createDefaultMask("rectangle", "rectangle"), width: 40, height: 20, feather: 0};
    const ellipse = {...createDefaultMask("ellipse", "ellipse"), width: 40, height: 20, feather: 0};
    expect(maskAlphaAt(rectangle, 0.5, 0.5)).toBe(1);
    expect(maskAlphaAt(rectangle, 0.1, 0.5)).toBe(0);
    expect(maskAlphaAt(ellipse, 0.69, 0.5)).toBe(1);
    expect(maskAlphaAt(ellipse, 0.5, 0.61)).toBe(0);
  });

  it("combines add, subtract, intersect, inversion, and opacity", () => {
    const outer = {...createDefaultMask("outer", "rectangle"), width: 80, height: 80, feather: 0};
    const hole = {...createDefaultMask("hole", "ellipse"), width: 20, height: 20, feather: 0, combineMode: "subtract" as const};
    expect(combinedMaskAlphaAt([outer, hole], 0.5, 0.5)).toBe(0);
    expect(combinedMaskAlphaAt([outer, hole], 0.7, 0.5)).toBe(1);
    expect(maskAlphaAt({...outer, inverted: true}, 0.5, 0.5)).toBe(0);
    expect(maskAlphaAt({...outer, opacity: 40}, 0.5, 0.5)).toBeCloseTo(0.4, 8);
  });

  it("interpolates and upserts independent mask keyframes", () => {
    let mask = createDefaultMask("tracked");
    mask = upsertMaskKeyframe(mask, "x", 0, 20, {id: "start"});
    mask = upsertMaskKeyframe(mask, "x", 10, 80, {id: "end"});
    expect(getAnimatedMaskProperty(mask, "x", 5)).toBe(50);
    mask = upsertMaskKeyframe(mask, "x", 10, 70, {confidence: 0.8});
    expect(mask.keyframes.filter((keyframe) => keyframe.property === "x" && keyframe.frame === 10)).toHaveLength(1);
    expect(getAnimatedMaskProperty(mask, "x", 10)).toBe(70);
  });
});
