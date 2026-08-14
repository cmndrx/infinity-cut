import type {ProjectLut} from "./types";
import type {RgbColor} from "./color-math";

type ParsedDirective = {
  title?: string;
  kind?: "1d" | "3d";
  size?: number;
  domainMin: RgbColor;
  domainMax: RgbColor;
  values: number[];
};

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const parseTriplet = (tokens: string[], line: number) => {
  if (tokens.length !== 3) throw new Error(`Expected three values on LUT line ${line}`);
  const values = tokens.map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error(`Invalid numeric value on LUT line ${line}`);
  return values as RgbColor;
};

const fingerprint = (text: string) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const float32ToBase64 = (values: Float32Array) => {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
};

export const base64ToFloat32 = (encoded: string) => {
  const binary = atob(encoded);
  if (binary.length % Float32Array.BYTES_PER_ELEMENT !== 0) throw new Error("LUT payload has an invalid byte length");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Float32Array(bytes.buffer);
};

export const parseCubeLut = (text: string, options: {id?: string; name?: string} = {}): ProjectLut => {
  const parsed: ParsedDirective = {domainMin: [0, 0, 0], domainMax: [1, 1, 1], values: []};
  const source = text.replace(/^\uFEFF/, "");
  source.split(/\r?\n/).forEach((rawLine, zeroIndex) => {
    const lineNumber = zeroIndex + 1;
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) return;
    const title = line.match(/^TITLE\s+"([^"]*)"$/i);
    if (title) {
      parsed.title = title[1];
      return;
    }
    const tokens = line.split(/\s+/);
    const directive = tokens[0].toUpperCase();
    if (directive === "LUT_1D_SIZE" || directive === "LUT_3D_SIZE") {
      const size = Number(tokens[1]);
      if (!Number.isInteger(size) || size < 2 || size > 256) throw new Error(`Invalid LUT size on line ${lineNumber}`);
      const kind = directive === "LUT_1D_SIZE" ? "1d" : "3d";
      if (parsed.kind && parsed.kind !== kind) throw new Error("A .cube file cannot contain both 1D and 3D tables");
      parsed.kind = kind;
      parsed.size = size;
      return;
    }
    if (directive === "DOMAIN_MIN" || directive === "DOMAIN_MAX") {
      const value = parseTriplet(tokens.slice(1), lineNumber);
      if (directive === "DOMAIN_MIN") parsed.domainMin = value;
      else parsed.domainMax = value;
      return;
    }
    if (/^[A-Z_]+$/.test(directive)) throw new Error(`Unsupported LUT directive ${directive} on line ${lineNumber}`);
    parsed.values.push(...parseTriplet(tokens, lineNumber));
  });

  if (!parsed.kind || !parsed.size) throw new Error("The .cube file is missing LUT_1D_SIZE or LUT_3D_SIZE");
  if (parsed.domainMin.some((value, index) => value >= parsed.domainMax[index])) throw new Error("LUT domain maximums must be greater than minimums");
  const entries = parsed.kind === "1d" ? parsed.size : parsed.size ** 3;
  if (parsed.values.length !== entries * 3) {
    throw new Error(`Expected ${entries} LUT rows but found ${parsed.values.length / 3}`);
  }
  const resolvedName = options.name?.trim() || parsed.title?.trim() || "Imported LUT";
  return {
    id: options.id?.trim() || `lut-${fingerprint(source).slice(6)}`,
    name: resolvedName,
    kind: parsed.kind,
    size: parsed.size,
    domainMin: parsed.domainMin,
    domainMax: parsed.domainMax,
    dataBase64: float32ToBase64(Float32Array.from(parsed.values)),
    fingerprint: fingerprint(source),
  };
};

const sample1d = (data: Float32Array, size: number, channel: number, input: number) => {
  const scaled = clamp(input) * (size - 1);
  const left = Math.floor(scaled);
  const right = Math.min(size - 1, left + 1);
  const progress = scaled - left;
  return data[left * 3 + channel] + (data[right * 3 + channel] - data[left * 3 + channel]) * progress;
};

const sample3d = (data: Float32Array, size: number, red: number, green: number, blue: number): RgbColor => {
  const scaled = [red, green, blue].map((value) => clamp(value) * (size - 1)) as RgbColor;
  const low = scaled.map(Math.floor) as RgbColor;
  const high = low.map((value) => Math.min(size - 1, value + 1)) as RgbColor;
  const fraction = scaled.map((value, index) => value - low[index]) as RgbColor;
  const at = (r: number, g: number, b: number, channel: number) => data[((b * size * size + g * size + r) * 3) + channel];
  const lerp = (left: number, right: number, amount: number) => left + (right - left) * amount;
  return [0, 1, 2].map((channel) => {
    const c00 = lerp(at(low[0], low[1], low[2], channel), at(high[0], low[1], low[2], channel), fraction[0]);
    const c10 = lerp(at(low[0], high[1], low[2], channel), at(high[0], high[1], low[2], channel), fraction[0]);
    const c01 = lerp(at(low[0], low[1], high[2], channel), at(high[0], low[1], high[2], channel), fraction[0]);
    const c11 = lerp(at(low[0], high[1], high[2], channel), at(high[0], high[1], high[2], channel), fraction[0]);
    return lerp(lerp(c00, c10, fraction[1]), lerp(c01, c11, fraction[1]), fraction[2]);
  }) as RgbColor;
};

export const evaluateLut = (lut: ProjectLut, input: RgbColor): RgbColor => {
  const expected = (lut.kind === "1d" ? lut.size : lut.size ** 3) * 3;
  const data = base64ToFloat32(lut.dataBase64);
  if (data.length !== expected) throw new Error(`LUT ${lut.name} has an invalid data payload`);
  const normalized = input.map((value, index) => (value - lut.domainMin[index]) / (lut.domainMax[index] - lut.domainMin[index])) as RgbColor;
  if (lut.kind === "1d") return [0, 1, 2].map((channel) => sample1d(data, lut.size, channel, normalized[channel])) as RgbColor;
  return sample3d(data, lut.size, normalized[0], normalized[1], normalized[2]);
};

export const applyLutWithIntensity = (lut: ProjectLut, input: RgbColor, intensity: number): RgbColor => {
  const evaluated = evaluateLut(lut, input);
  const mix = clamp(intensity / 100);
  return input.map((channel, index) => channel + (evaluated[index] - channel) * mix) as RgbColor;
};

const formatNumber = (value: number) => {
  const rounded = Math.abs(value) < 0.0000005 ? 0 : value;
  return rounded.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
};

export const exportCubeLut = (lut: ProjectLut) => {
  const data = base64ToFloat32(lut.dataBase64);
  const expected = (lut.kind === "1d" ? lut.size : lut.size ** 3) * 3;
  if (data.length !== expected) throw new Error(`LUT ${lut.name} has an invalid data payload`);
  const lines = [
    `TITLE "${lut.name.replace(/["\r\n]/g, "")}"`,
    `${lut.kind === "1d" ? "LUT_1D_SIZE" : "LUT_3D_SIZE"} ${lut.size}`,
    `DOMAIN_MIN ${lut.domainMin.map(formatNumber).join(" ")}`,
    `DOMAIN_MAX ${lut.domainMax.map(formatNumber).join(" ")}`,
  ];
  for (let offset = 0; offset < data.length; offset += 3) {
    lines.push(`${formatNumber(data[offset])} ${formatNumber(data[offset + 1])} ${formatNumber(data[offset + 2])}`);
  }
  return `${lines.join("\n")}\n`;
};
