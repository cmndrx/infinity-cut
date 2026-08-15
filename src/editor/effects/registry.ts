export type VisualEffectClipKind = "video" | "image" | "title" | "caption" | "sequence";
export type EffectParameter =
  | {type: "number"; default: number; min: number; max: number; step: number; unit?: string}
  | {type: "boolean"; default: boolean}
  | {type: "color"; default: string}
  | {type: "select"; default: string; options: readonly string[]};

export type VisualEffectDescriptor = {
  id: string;
  version: 1;
  name: string;
  category: "color" | "blur" | "distort" | "stylize" | "generate" | "utility";
  backend: "css" | "canvas-2d" | "webgl2" | "overlay";
  renderKey: string;
  supportedKinds: readonly VisualEffectClipKind[];
  parameters: Readonly<Record<string, EffectParameter>>;
};

export type VisualEffectInstance = {
  id: string;
  descriptorId: string;
  descriptorVersion: number;
  enabled: boolean;
  parameters: Record<string, number | boolean | string>;
};

const number = (defaultValue: number, min: number, max: number, step = 1, unit?: string): EffectParameter => ({type: "number", default: defaultValue, min, max, step, unit});
const boolean = (defaultValue: boolean): EffectParameter => ({type: "boolean", default: defaultValue});
const color = (defaultValue: string): EffectParameter => ({type: "color", default: defaultValue});
const select = (defaultValue: string, options: readonly string[]): EffectParameter => ({type: "select", default: defaultValue, options});
const visual = ["video", "image"] as const;

export const BUILTIN_VISUAL_EFFECTS: readonly VisualEffectDescriptor[] = [
  {id: "dc.effect.brightness", version: 1, name: "Brightness", category: "color", backend: "css", renderKey: "brightness", supportedKinds: visual, parameters: {amount: number(0, -1, 1, 0.01)}},
  {id: "dc.effect.contrast", version: 1, name: "Contrast", category: "color", backend: "css", renderKey: "contrast", supportedKinds: visual, parameters: {amount: number(0, -1, 1, 0.01)}},
  {id: "dc.effect.saturation", version: 1, name: "Saturation", category: "color", backend: "css", renderKey: "saturation", supportedKinds: visual, parameters: {amount: number(1, 0, 3, 0.01)}},
  {id: "dc.effect.hue", version: 1, name: "Hue Rotate", category: "color", backend: "css", renderKey: "hue", supportedKinds: visual, parameters: {degrees: number(0, -180, 180, 1, "deg")}},
  {id: "dc.effect.tint", version: 1, name: "Tint", category: "color", backend: "css", renderKey: "tint", supportedKinds: visual, parameters: {color: color("#ffffff"), amount: number(0, 0, 1, 0.01)}},
  {id: "dc.effect.duotone", version: 1, name: "Duotone", category: "color", backend: "css", renderKey: "duotone", supportedKinds: visual, parameters: {shadow: color("#10152b"), highlight: color("#f3b36b"), amount: number(1, 0, 1, 0.01)}},
  {id: "dc.effect.grayscale", version: 1, name: "Grayscale", category: "color", backend: "css", renderKey: "grayscale", supportedKinds: visual, parameters: {amount: number(1, 0, 1, 0.01)}},
  {id: "dc.effect.invert", version: 1, name: "Invert", category: "color", backend: "css", renderKey: "invert", supportedKinds: visual, parameters: {amount: number(1, 0, 1, 0.01)}},
  {id: "dc.effect.blur", version: 1, name: "Gaussian Blur", category: "blur", backend: "css", renderKey: "blur", supportedKinds: visual, parameters: {radius: number(8, 0, 100, 0.5, "px")}},
  {id: "dc.effect.progressive-blur", version: 1, name: "Progressive Blur", category: "blur", backend: "css", renderKey: "linearProgressiveBlur", supportedKinds: visual, parameters: {radius: number(16, 0, 100, 0.5, "px"), direction: select("bottom", ["top", "right", "bottom", "left"])}},
  {id: "dc.effect.zoom-blur", version: 1, name: "Zoom Blur", category: "blur", backend: "css", renderKey: "zoomBlur", supportedKinds: visual, parameters: {amount: number(0.2, 0, 1, 0.01), centerX: number(0.5, 0, 1, 0.01), centerY: number(0.5, 0, 1, 0.01)}},
  {id: "dc.effect.glow", version: 1, name: "Glow", category: "stylize", backend: "css", renderKey: "glow", supportedKinds: visual, parameters: {radius: number(12, 0, 100, 0.5), intensity: number(0.5, 0, 2, 0.01)}},
  {id: "dc.effect.drop-shadow", version: 1, name: "Drop Shadow", category: "stylize", backend: "css", renderKey: "dropShadow", supportedKinds: visual, parameters: {distance: number(12, -200, 200, 1), angle: number(45, -180, 180, 1), blur: number(16, 0, 100, 1), color: color("#000000"), opacity: number(0.6, 0, 1, 0.01)}},
  {id: "dc.effect.pixelate", version: 1, name: "Pixelate", category: "stylize", backend: "css", renderKey: "pixelate", supportedKinds: visual, parameters: {size: number(12, 1, 100, 1, "px")}},
  {id: "dc.effect.halftone", version: 1, name: "Halftone", category: "stylize", backend: "css", renderKey: "halftone", supportedKinds: visual, parameters: {size: number(8, 1, 64, 1), angle: number(45, -180, 180, 1)}},
  {id: "dc.effect.scanlines", version: 1, name: "Scanlines", category: "stylize", backend: "css", renderKey: "scanlines", supportedKinds: visual, parameters: {spacing: number(4, 1, 40, 1), opacity: number(0.35, 0, 1, 0.01)}},
  {id: "dc.effect.chromatic-aberration", version: 1, name: "Chromatic Aberration", category: "distort", backend: "css", renderKey: "chromaticAberration", supportedKinds: visual, parameters: {amount: number(8, 0, 80, 0.5, "px"), radial: boolean(false)}},
  {id: "dc.effect.barrel-distortion", version: 1, name: "Barrel Distortion", category: "distort", backend: "css", renderKey: "barrelDistortion", supportedKinds: visual, parameters: {amount: number(0.15, -1, 1, 0.01)}},
  {id: "dc.effect.fisheye", version: 1, name: "Fisheye", category: "distort", backend: "css", renderKey: "fisheye", supportedKinds: visual, parameters: {amount: number(0.4, -1, 1, 0.01)}},
  {id: "dc.effect.mirror", version: 1, name: "Mirror", category: "distort", backend: "css", renderKey: "mirror", supportedKinds: visual, parameters: {direction: select("horizontal", ["horizontal", "vertical", "quad"])}},
  {id: "dc.effect.wave", version: 1, name: "Wave", category: "distort", backend: "css", renderKey: "wave", supportedKinds: visual, parameters: {amplitude: number(12, 0, 100, 0.5), frequency: number(4, 0.1, 20, 0.1), phase: number(0, -10, 10, 0.01)}},
  {id: "dc.effect.noise", version: 1, name: "Film Noise", category: "stylize", backend: "css", renderKey: "noise", supportedKinds: visual, parameters: {amount: number(0.18, 0, 1, 0.01), monochrome: boolean(true), seed: number(1, 0, 9999, 1)}},
  {id: "dc.effect.paper", version: 1, name: "Paper Texture", category: "stylize", backend: "css", renderKey: "paper", supportedKinds: visual, parameters: {amount: number(0.35, 0, 1, 0.01), seed: number(1, 0, 9999, 1)}},
  {id: "dc.effect.rough-edges", version: 1, name: "Rough Edges", category: "stylize", backend: "css", renderKey: "roughenEdges", supportedKinds: visual, parameters: {amount: number(0.25, 0, 1, 0.01), scale: number(8, 1, 100, 1)}},
  {id: "dc.effect.light-leak", version: 1, name: "Light Leak", category: "generate", backend: "overlay", renderKey: "lightLeak", supportedKinds: ["video", "image", "title", "sequence"], parameters: {progress: number(0, 0, 1, 0.01), seed: number(1, 0, 9999, 1), opacity: number(0.7, 0, 1, 0.01)}},
] as const;

const effectMap = new Map(BUILTIN_VISUAL_EFFECTS.map((effect) => [effect.id, effect]));

export const getVisualEffectDescriptor = (id: string) => effectMap.get(id);
export const listVisualEffects = (query = "", category?: VisualEffectDescriptor["category"]) => {
  const normalized = query.trim().toLowerCase();
  return BUILTIN_VISUAL_EFFECTS.filter((effect) => (!category || effect.category === category)
    && (!normalized || effect.name.toLowerCase().includes(normalized) || effect.category.includes(normalized) || effect.id.includes(normalized)));
};

export const defaultEffectParameters = (descriptor: VisualEffectDescriptor) => Object.fromEntries(Object.entries(descriptor.parameters).map(([key, parameter]) => [key, parameter.default]));

export const validateVisualEffectInstance = (instance: VisualEffectInstance) => {
  if (!instance || typeof instance !== "object" || typeof instance.id !== "string" || !instance.id || typeof instance.enabled !== "boolean") return false;
  const descriptor = getVisualEffectDescriptor(instance.descriptorId);
  if (!descriptor || instance.descriptorVersion !== descriptor.version || !instance.parameters || typeof instance.parameters !== "object" || Array.isArray(instance.parameters)) return false;
  const keys = Object.keys(instance.parameters);
  if (keys.length !== Object.keys(descriptor.parameters).length || keys.some((key) => !(key in descriptor.parameters))) return false;
  return Object.entries(descriptor.parameters).every(([key, schema]) => {
    const value = instance.parameters[key];
    if (schema.type === "number") return typeof value === "number" && Number.isFinite(value) && value >= schema.min && value <= schema.max;
    if (schema.type === "boolean") return typeof value === "boolean";
    if (schema.type === "color") return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
    return typeof value === "string" && schema.options.includes(value);
  });
};

export const createVisualEffectInstance = (descriptorId: string, id: string, parameters: Record<string, number | boolean | string> = {}): VisualEffectInstance => {
  const descriptor = getVisualEffectDescriptor(descriptorId);
  if (!descriptor) throw new Error(`Unknown visual effect ${descriptorId}`);
  const instance = {id, descriptorId, descriptorVersion: descriptor.version, enabled: true, parameters: {...defaultEffectParameters(descriptor), ...parameters}};
  if (!validateVisualEffectInstance(instance)) throw new Error(`Invalid parameters for ${descriptor.name}`);
  return instance;
};

export type TransitionDescriptor = {
  id: string;
  name: string;
  category: "dissolve" | "wipe" | "slide" | "stylize";
  renderKey: string;
  parameters: Readonly<Record<string, EffectParameter>>;
};

export const BUILTIN_TRANSITIONS: readonly TransitionDescriptor[] = [
  {id: "dc.transition.cross-dissolve", name: "Cross Dissolve", category: "dissolve", renderKey: "crossDissolve", parameters: {}},
  {id: "dc.transition.dip-black", name: "Dip to Black", category: "dissolve", renderKey: "dip", parameters: {color: color("#000000")}},
  {id: "dc.transition.dip-white", name: "Dip to White", category: "dissolve", renderKey: "dip", parameters: {color: color("#ffffff")}},
  {id: "dc.transition.wipe", name: "Directional Wipe", category: "wipe", renderKey: "wipe", parameters: {direction: select("left", ["left", "right", "up", "down"]), feather: number(0, 0, 100, 1)}},
  {id: "dc.transition.slide", name: "Slide", category: "slide", renderKey: "slide", parameters: {direction: select("left", ["left", "right", "up", "down"])}},
  {id: "dc.transition.push", name: "Push", category: "slide", renderKey: "push", parameters: {direction: select("left", ["left", "right", "up", "down"])}},
  {id: "dc.transition.zoom", name: "Zoom", category: "stylize", renderKey: "zoom", parameters: {blur: number(0.2, 0, 1, 0.01)}},
  {id: "dc.transition.flip", name: "Flip", category: "stylize", renderKey: "flip", parameters: {axis: select("horizontal", ["horizontal", "vertical"])}},
  {id: "dc.transition.clock-wipe", name: "Clock Wipe", category: "wipe", renderKey: "clockWipe", parameters: {clockwise: boolean(true), startAngle: number(-90, -180, 180, 1)}},
  {id: "dc.transition.iris", name: "Iris", category: "wipe", renderKey: "iris", parameters: {shape: select("circle", ["circle", "diamond"]), feather: number(0, 0, 100, 1)}},
  {id: "dc.transition.light-leak", name: "Light Leak", category: "stylize", renderKey: "lightLeak", parameters: {seed: number(1, 0, 9999, 1), intensity: number(0.8, 0, 1, 0.01)}},
  {id: "dc.transition.pixel-dissolve", name: "Pixel Dissolve", category: "stylize", renderKey: "pixelDissolve", parameters: {cellSize: number(16, 2, 100, 1), seed: number(1, 0, 9999, 1)}},
] as const;
