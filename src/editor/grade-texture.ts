import {applyColorGrade, normalizeColorGrade} from "./color-math";
import {applyLutWithIntensity} from "./cube-lut";
import type {ColorGrade, ProjectLut} from "./types";

export const GRADE_SIZE = 33;
export const gradeRequiresProcessing = (grade: ColorGrade) => Boolean(
  (grade.lutId && grade.lutIntensity > 0)
  || Object.values(grade.curves).some((points) => points.some((point) => point.x !== point.y))
  || Object.values(grade.wheels).some((wheel) => wheel.x !== 0 || wheel.y !== 0 || wheel.luma !== 0)
  || grade.hslSecondaries.some((item) => item.enabled && (item.correctionX !== 0 || item.correctionY !== 0 || item.exposure !== 0 || item.saturation !== 0))
);
/** RGB cube packed into blue slices, red columns, green rows. SDR, 8-bit output. */
export const buildGradeTexture = (value: ColorGrade, luts: ProjectLut[]) => {
  const grade = normalizeColorGrade(value);
  const lut = grade.lutId ? luts.find((item) => item.id === grade.lutId) : undefined;
  if (grade.lutId && !lut) throw new Error("The selected color LUT is missing; reimport it or choose None");
  const data = new Uint8Array(GRADE_SIZE ** 3 * 4);
  for (let b = 0; b < GRADE_SIZE; b++) for (let g = 0; g < GRADE_SIZE; g++) for (let r = 0; r < GRADE_SIZE; r++) {
    let color = applyColorGrade([r / (GRADE_SIZE - 1), g / (GRADE_SIZE - 1), b / (GRADE_SIZE - 1)], grade);
    if (lut && grade.lutIntensity > 0) color = applyLutWithIntensity(lut, color, grade.lutIntensity);
    const offset = (g * GRADE_SIZE * GRADE_SIZE + b * GRADE_SIZE + r) * 4;
    color.forEach((channel, index) => { data[offset + index] = Math.round(Math.max(0, Math.min(1, channel)) * 255); });
    data[offset + 3] = 255;
  }
  return data;
};
