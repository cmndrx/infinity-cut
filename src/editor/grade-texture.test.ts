import {describe, expect, it} from "vitest";
import {DEFAULT_COLOR_GRADE} from "./types";
import {parseCubeLut} from "./cube-lut";
import {buildGradeTexture, gradeRequiresProcessing, GRADE_SIZE} from "./grade-texture";

const pixel = (data: Uint8Array, r: number, g: number, b: number) => Array.from(data.slice((g * GRADE_SIZE ** 2 + b * GRADE_SIZE + r) * 4, (g * GRADE_SIZE ** 2 + b * GRADE_SIZE + r) * 4 + 3));
describe("GPU grade lookup pixels", () => {
  it("preserves neutral colors and modifies midtones with the wheel", () => {
    const grade = structuredClone(DEFAULT_COLOR_GRADE);
    expect(gradeRequiresProcessing(grade)).toBe(false);
    expect(pixel(buildGradeTexture(grade, []), 16, 16, 16)).toEqual([128, 128, 128]);
    grade.wheels.midtones.x = 1;
    expect(gradeRequiresProcessing(grade)).toBe(true);
    const shifted = pixel(buildGradeTexture(grade, []), 16, 16, 16);
    expect(shifted[0]).toBeGreaterThan(160);
    expect(shifted[2]).toBeLessThan(95);
  });
  it("applies a LUT at its selected intensity, and fails on a missing LUT", () => {
    const grade = structuredClone(DEFAULT_COLOR_GRADE);
    const lut = parseCubeLut("LUT_1D_SIZE 2\n1 1 1\n0 0 0\n");
    grade.lutId = lut.id;
    grade.lutIntensity = 100;
    expect(pixel(buildGradeTexture(grade, [lut]), 0, 0, 0)).toEqual([255, 255, 255]);
    grade.lutIntensity = 50;
    expect(pixel(buildGradeTexture(grade, [lut]), 0, 0, 0)).toEqual([128, 128, 128]);
    expect(() => buildGradeTexture(grade, [])).toThrow("missing");
  });
  it("limits an HSL secondary to the selected hues", () => {
    const grade = structuredClone(DEFAULT_COLOR_GRADE);
    grade.hslSecondaries = [{id: "red", name: "Red", enabled: true, hueStart: 350, hueEnd: 10, hueSoftness: 0, saturationMin: 0, saturationMax: 1, saturationSoftness: 0, luminanceMin: 0, luminanceMax: 1, luminanceSoftness: 0, correctionX: 0, correctionY: 0, exposure: -1, saturation: 0}];
    const data = buildGradeTexture(grade, []);
    expect(pixel(data, 32, 0, 0)).toEqual([128, 0, 0]);
    expect(pixel(data, 0, 32, 0)).toEqual([0, 255, 0]);
  });
});
