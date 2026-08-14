import {describe, expect, it} from "vitest";
import {applyColorGrade, evaluateCurve, hslSecondaryWeight, normalizeColorGrade, normalizeCurvePoints} from "./color-math";
import type {HslSecondary} from "./types";

const secondary = (updates: Partial<HslSecondary> = {}): HslSecondary => ({
  id: "secondary",
  name: "Reds",
  enabled: true,
  hueStart: 350,
  hueEnd: 10,
  hueSoftness: 10,
  saturationMin: 0.2,
  saturationMax: 1,
  saturationSoftness: 0.1,
  luminanceMin: 0,
  luminanceMax: 1,
  luminanceSoftness: 0.1,
  correctionX: 0,
  correctionY: 0,
  exposure: 0,
  saturation: 0,
  ...updates,
});

describe("professional color math", () => {
  it("keeps the default grade pixel-identical", () => {
    expect(applyColorGrade([0.12, 0.5, 0.91], undefined)).toEqual([0.12, 0.5, 0.91]);
  });

  it("normalizes curve points, locks endpoints, and interpolates deterministically", () => {
    const points = normalizeCurvePoints([
      {id: "high", x: 0.75, y: 0.9},
      {id: "duplicate-a", x: 0.5, y: 0.2},
      {id: "duplicate-b", x: 0.5, y: 0.6},
    ], "master");
    expect(points.map(({x, y}) => [x, y])).toEqual([[0, 0], [0.5, 0.6], [0.75, 0.9], [1, 1]]);
    expect(evaluateCurve(points, 0.625)).toBeCloseTo(0.75, 8);
  });

  it("weights hue ranges correctly across the zero-degree wrap", () => {
    expect(hslSecondaryWeight([1, 0, 0], secondary())).toBeCloseTo(1, 8);
    expect(hslSecondaryWeight([0, 1, 0], secondary())).toBe(0);
  });

  it("applies tonal wheels to their intended luminance region", () => {
    const grade = normalizeColorGrade({
      wheels: {
        shadows: {x: 1, y: 0, luma: 0},
        midtones: {x: 0, y: 0, luma: 0},
        highlights: {x: 0, y: 0, luma: 0},
      },
    });
    const shadow = applyColorGrade([0.05, 0.05, 0.05], grade);
    const highlight = applyColorGrade([0.95, 0.95, 0.95], grade);
    expect(shadow[0]).toBeGreaterThan(shadow[2]);
    expect(highlight[0]).toBeCloseTo(highlight[2], 8);
  });
});
