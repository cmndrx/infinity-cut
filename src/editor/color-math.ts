import type {ColorCurvePoint, ColorGrade, ColorWheel, HslSecondary} from "./types";
import {DEFAULT_COLOR_GRADE} from "./types";

export type RgbColor = [number, number, number];

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const normalizeCurvePoints = (points: ColorCurvePoint[] | null | undefined, channel = "curve"): ColorCurvePoint[] => {
  const byX = new Map<number, ColorCurvePoint>();
  for (const [index, point] of (points ?? []).entries()) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const x = clamp(point.x);
    byX.set(x, {id: point.id?.trim() || `${channel}-${index}`, x, y: clamp(point.y)});
  }
  if (!byX.has(0)) byX.set(0, {id: `${channel}-black`, x: 0, y: 0});
  if (!byX.has(1)) byX.set(1, {id: `${channel}-white`, x: 1, y: 1});
  return [...byX.values()].sort((left, right) => left.x - right.x);
};

export const evaluateCurve = (points: ColorCurvePoint[], input: number) => {
  const normalized = normalizeCurvePoints(points);
  const value = clamp(input);
  const rightIndex = normalized.findIndex((point) => point.x >= value);
  if (rightIndex <= 0) return normalized[0].y;
  const left = normalized[rightIndex - 1];
  const right = normalized[rightIndex];
  const progress = (value - left.x) / Math.max(Number.EPSILON, right.x - left.x);
  return left.y + (right.y - left.y) * progress;
};

const rgbToHsl = ([red, green, blue]: RgbColor): RgbColor => {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const difference = max - min;
  const saturation = lightness > 0.5 ? difference / (2 - max - min) : difference / (max + min);
  const hue = max === red
    ? ((green - blue) / difference + (green < blue ? 6 : 0)) / 6
    : max === green
      ? ((blue - red) / difference + 2) / 6
      : ((red - green) / difference + 4) / 6;
  return [hue, saturation, lightness];
};

const hueToRgb = (p: number, q: number, raw: number) => {
  const hue = (raw % 1 + 1) % 1;
  if (hue < 1 / 6) return p + (q - p) * 6 * hue;
  if (hue < 1 / 2) return q;
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
  return p;
};

const hslToRgb = ([hue, saturation, lightness]: RgbColor): RgbColor => {
  if (saturation === 0) return [lightness, lightness, lightness];
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return [hueToRgb(p, q, hue + 1 / 3), hueToRgb(p, q, hue), hueToRgb(p, q, hue - 1 / 3)];
};

const circularHueDistance = (left: number, right: number) => {
  const distance = Math.abs(((left - right) % 360 + 360) % 360);
  return Math.min(distance, 360 - distance);
};

const hueRangeWeight = (hue: number, start: number, end: number, softness: number) => {
  if (Math.abs(end - start) >= 360) return 1;
  const normalizedHue = ((hue % 360) + 360) % 360;
  const normalizedStart = ((start % 360) + 360) % 360;
  const normalizedEnd = ((end % 360) + 360) % 360;
  const inside = normalizedStart <= normalizedEnd
    ? normalizedHue >= normalizedStart && normalizedHue <= normalizedEnd
    : normalizedHue >= normalizedStart || normalizedHue <= normalizedEnd;
  if (inside) return 1;
  const edgeDistance = Math.min(circularHueDistance(normalizedHue, normalizedStart), circularHueDistance(normalizedHue, normalizedEnd));
  return clamp(1 - edgeDistance / Math.max(Number.EPSILON, softness));
};

const rangeWeight = (value: number, minimum: number, maximum: number, softness: number) => {
  const low = Math.min(minimum, maximum);
  const high = Math.max(minimum, maximum);
  if (value >= low && value <= high) return 1;
  if (value < low) return clamp(1 - (low - value) / Math.max(Number.EPSILON, softness));
  return clamp(1 - (value - high) / Math.max(Number.EPSILON, softness));
};

export const hslSecondaryWeight = (color: RgbColor, secondary: HslSecondary) => {
  const [hue, saturation, luminance] = rgbToHsl(color);
  return hueRangeWeight(hue * 360, secondary.hueStart, secondary.hueEnd, Math.max(0, secondary.hueSoftness))
    * rangeWeight(saturation, secondary.saturationMin, secondary.saturationMax, Math.max(0, secondary.saturationSoftness))
    * rangeWeight(luminance, secondary.luminanceMin, secondary.luminanceMax, Math.max(0, secondary.luminanceSoftness));
};

const wheelShift = (wheel: ColorWheel): RgbColor => {
  const x = clamp(finite(wheel.x, 0), -1, 1);
  const y = clamp(finite(wheel.y, 0), -1, 1);
  return [x * 0.18 - y * 0.09, y * 0.18, -x * 0.18 - y * 0.09];
};

const applyWheel = (color: RgbColor, wheel: ColorWheel, weight: number): RgbColor => {
  const shift = wheelShift(wheel);
  const luma = clamp(finite(wheel.luma, 0), -1, 1) * 0.25;
  return color.map((channel, index) => clamp(channel + (shift[index] + luma) * weight)) as RgbColor;
};

const applySecondary = (color: RgbColor, secondary: HslSecondary): RgbColor => {
  if (!secondary.enabled) return color;
  const weight = hslSecondaryWeight(color, secondary);
  if (weight <= 0) return color;
  const [hue, saturation, luminance] = rgbToHsl(color);
  const angle = Math.atan2(secondary.correctionY, secondary.correctionX) / (Math.PI * 2);
  const magnitude = clamp(Math.hypot(secondary.correctionX, secondary.correctionY), 0, 1);
  const corrected = hslToRgb([
    hue + angle * magnitude,
    clamp(saturation * (1 + secondary.saturation / 100)),
    clamp(luminance * (2 ** secondary.exposure)),
  ]);
  return color.map((channel, index) => clamp(channel + (corrected[index] - channel) * weight)) as RgbColor;
};

const normalizeWheel = (value: Partial<ColorWheel> | null | undefined): ColorWheel => ({
  x: clamp(finite(value?.x, 0), -1, 1),
  y: clamp(finite(value?.y, 0), -1, 1),
  luma: clamp(finite(value?.luma, 0), -1, 1),
});

export const normalizeColorGrade = (value: Partial<ColorGrade> | null | undefined): ColorGrade => {
  const curves = value?.curves;
  const wheels = value?.wheels;
  return {
    curves: {
      master: normalizeCurvePoints(curves?.master, "master"),
      red: normalizeCurvePoints(curves?.red, "red"),
      green: normalizeCurvePoints(curves?.green, "green"),
      blue: normalizeCurvePoints(curves?.blue, "blue"),
    },
    wheels: {
      shadows: normalizeWheel(wheels?.shadows),
      midtones: normalizeWheel(wheels?.midtones),
      highlights: normalizeWheel(wheels?.highlights),
    },
    hslSecondaries: Array.isArray(value?.hslSecondaries) ? value.hslSecondaries.flatMap((secondary, index) => {
      if (!secondary || typeof secondary !== "object") return [];
      return [{
        id: typeof secondary.id === "string" && secondary.id.trim() ? secondary.id : `secondary-${index + 1}`,
        name: typeof secondary.name === "string" && secondary.name.trim() ? secondary.name : `Secondary ${index + 1}`,
        enabled: secondary.enabled !== false,
        hueStart: ((finite(secondary.hueStart, 0) % 360) + 360) % 360,
        hueEnd: finite(secondary.hueEnd, 360) === 360 ? 360 : ((finite(secondary.hueEnd, 360) % 360) + 360) % 360,
        hueSoftness: clamp(finite(secondary.hueSoftness, 0), 0, 180),
        saturationMin: clamp(finite(secondary.saturationMin, 0)),
        saturationMax: clamp(finite(secondary.saturationMax, 1)),
        saturationSoftness: clamp(finite(secondary.saturationSoftness, 0)),
        luminanceMin: clamp(finite(secondary.luminanceMin, 0)),
        luminanceMax: clamp(finite(secondary.luminanceMax, 1)),
        luminanceSoftness: clamp(finite(secondary.luminanceSoftness, 0)),
        correctionX: clamp(finite(secondary.correctionX, 0), -1, 1),
        correctionY: clamp(finite(secondary.correctionY, 0), -1, 1),
        exposure: clamp(finite(secondary.exposure, 0), -10, 10),
        saturation: clamp(finite(secondary.saturation, 0), -100, 400),
      }];
    }) : [],
    lutId: typeof value?.lutId === "string" && value.lutId.trim() ? value.lutId : undefined,
    lutIntensity: clamp(finite(value?.lutIntensity, DEFAULT_COLOR_GRADE.lutIntensity), 0, 100),
  };
};

export const applyColorGrade = (input: RgbColor, value: Partial<ColorGrade> | null | undefined): RgbColor => {
  const grade = normalizeColorGrade(value);
  let color = input.map((channel) => clamp(channel)) as RgbColor;
  color = color.map((channel) => evaluateCurve(grade.curves.master, channel)) as RgbColor;
  color = [
    evaluateCurve(grade.curves.red, color[0]),
    evaluateCurve(grade.curves.green, color[1]),
    evaluateCurve(grade.curves.blue, color[2]),
  ];
  const luminance = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
  const shadowWeight = clamp(1 - luminance * 2);
  const highlightWeight = clamp(luminance * 2 - 1);
  const midtoneWeight = clamp(1 - shadowWeight - highlightWeight);
  color = applyWheel(color, grade.wheels.shadows, shadowWeight);
  color = applyWheel(color, grade.wheels.midtones, midtoneWeight);
  color = applyWheel(color, grade.wheels.highlights, highlightWeight);
  for (const secondary of grade.hslSecondaries) color = applySecondary(color, secondary);
  return color;
};
