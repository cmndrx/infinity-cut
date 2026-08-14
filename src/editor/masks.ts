import type {EditorEffectMask, MaskKeyframe, MaskProperty} from "./types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const ease = (progress: number, easing: MaskKeyframe["easing"]) => easing === "linear" ? progress : progress * progress * (3 - 2 * progress);
const maskProperties = new Set<MaskProperty>(["x", "y", "width", "height", "rotation", "feather", "opacity"]);

export const createDefaultMask = (id: string, shape: EditorEffectMask["shape"] = "ellipse", name?: string): EditorEffectMask => ({
  id,
  name: name?.trim() || (shape === "ellipse" ? "Ellipse Mask" : "Rectangle Mask"),
  target: "color",
  shape,
  enabled: true,
  inverted: false,
  combineMode: "add",
  x: 50,
  y: 50,
  width: 65,
  height: 65,
  rotation: 0,
  feather: 20,
  opacity: 100,
  keyframes: [],
});

export const normalizeEffectMask = (value: Partial<EditorEffectMask> | null | undefined, fallbackId: string): EditorEffectMask => {
  const shape = value?.shape === "rectangle" ? "rectangle" : "ellipse";
  const id = typeof value?.id === "string" && value.id.trim() ? value.id : fallbackId;
  const defaults = createDefaultMask(id, shape, value?.name);
  const keyframes = new Map<string, MaskKeyframe>();
  if (Array.isArray(value?.keyframes)) {
    value.keyframes.forEach((keyframe, index) => {
      if (!keyframe || typeof keyframe !== "object" || !maskProperties.has(keyframe.property)
        || !Number.isInteger(keyframe.frame) || keyframe.frame < 0 || !Number.isFinite(keyframe.value)) return;
      const normalized: MaskKeyframe = {
        id: typeof keyframe.id === "string" && keyframe.id.trim() ? keyframe.id : `${id}-${keyframe.property}-${keyframe.frame}-${index}`,
        property: keyframe.property,
        frame: keyframe.frame,
        value: keyframe.value,
        easing: keyframe.easing === "ease-in-out" ? "ease-in-out" : "linear",
        confidence: Number.isFinite(keyframe.confidence) ? clamp(keyframe.confidence!, 0, 1) : undefined,
      };
      keyframes.set(`${normalized.property}:${normalized.frame}`, normalized);
    });
  }
  return {
    ...defaults,
    id,
    name: typeof value?.name === "string" && value.name.trim() ? value.name : defaults.name,
    target: ["color", "blur", "vignette", "grain", "glow"].includes(String(value?.target)) ? value!.target! : defaults.target,
    shape,
    enabled: value?.enabled !== false,
    inverted: value?.inverted === true,
    combineMode: ["add", "subtract", "intersect"].includes(String(value?.combineMode)) ? value!.combineMode! : defaults.combineMode,
    x: clamp(finite(value?.x, defaults.x), -200, 300),
    y: clamp(finite(value?.y, defaults.y), -200, 300),
    width: clamp(finite(value?.width, defaults.width), 0.1, 400),
    height: clamp(finite(value?.height, defaults.height), 0.1, 400),
    rotation: finite(value?.rotation, defaults.rotation),
    feather: clamp(finite(value?.feather, defaults.feather), 0, 100),
    opacity: clamp(finite(value?.opacity, defaults.opacity), 0, 100),
    keyframes: [...keyframes.values()].sort((left, right) => left.frame - right.frame || left.property.localeCompare(right.property)),
  };
};

const maskPropertyValue = (mask: EditorEffectMask, property: MaskProperty) => mask[property];

export const getAnimatedMaskProperty = (mask: EditorEffectMask, property: MaskProperty, frame: number) => {
  const keyframes = mask.keyframes
    .filter((keyframe) => keyframe.property === property)
    .sort((left, right) => left.frame - right.frame);
  if (!keyframes.length) return maskPropertyValue(mask, property);
  if (frame <= keyframes[0].frame) return keyframes[0].value;
  if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value;
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.frame >= frame);
  const left = keyframes[rightIndex - 1];
  const right = keyframes[rightIndex];
  const progress = ease((frame - left.frame) / Math.max(1, right.frame - left.frame), right.easing);
  return left.value + (right.value - left.value) * progress;
};

export const maskAtFrame = (mask: EditorEffectMask, frame: number): EditorEffectMask => ({
  ...mask,
  x: getAnimatedMaskProperty(mask, "x", frame),
  y: getAnimatedMaskProperty(mask, "y", frame),
  width: getAnimatedMaskProperty(mask, "width", frame),
  height: getAnimatedMaskProperty(mask, "height", frame),
  rotation: getAnimatedMaskProperty(mask, "rotation", frame),
  feather: getAnimatedMaskProperty(mask, "feather", frame),
  opacity: getAnimatedMaskProperty(mask, "opacity", frame),
});

const smoothstep = (edge0: number, edge1: number, value: number) => {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return progress * progress * (3 - 2 * progress);
};

export const maskAlphaAt = (source: EditorEffectMask, sampleX: number, sampleY: number, frame = 0) => {
  if (!source.enabled) return 0;
  const mask = maskAtFrame(source, frame);
  const centerX = mask.x / 100;
  const centerY = mask.y / 100;
  const halfWidth = Math.max(0.0001, mask.width / 200);
  const halfHeight = Math.max(0.0001, mask.height / 200);
  const radians = (-mask.rotation * Math.PI) / 180;
  const relativeX = sampleX - centerX;
  const relativeY = sampleY - centerY;
  const x = relativeX * Math.cos(radians) - relativeY * Math.sin(radians);
  const y = relativeX * Math.sin(radians) + relativeY * Math.cos(radians);
  let signedDistance: number;
  if (mask.shape === "ellipse") {
    const radius = Math.hypot(x / halfWidth, y / halfHeight);
    signedDistance = (1 - radius) * Math.min(halfWidth, halfHeight);
  } else {
    const outsideX = Math.max(Math.abs(x) - halfWidth, 0);
    const outsideY = Math.max(Math.abs(y) - halfHeight, 0);
    const outside = Math.hypot(outsideX, outsideY);
    const inside = Math.min(Math.max(Math.abs(x) - halfWidth, Math.abs(y) - halfHeight), 0);
    signedDistance = -(outside + inside);
  }
  const featherRadius = (clamp(mask.feather, 0, 100) / 100) * Math.min(halfWidth, halfHeight);
  const raw = featherRadius === 0 ? (signedDistance >= 0 ? 1 : 0) : smoothstep(-featherRadius, featherRadius, signedDistance);
  const alpha = raw * clamp(mask.opacity / 100, 0, 1);
  return mask.inverted ? 1 - alpha : alpha;
};

export const combinedMaskAlphaAt = (masks: EditorEffectMask[], sampleX: number, sampleY: number, frame = 0) => {
  const active = masks.filter((mask) => mask.enabled);
  if (!active.length) return 1;
  let result = 0;
  active.forEach((mask, index) => {
    const alpha = maskAlphaAt(mask, sampleX, sampleY, frame);
    if (index === 0) {
      result = mask.combineMode === "subtract" ? 1 - alpha : alpha;
      return;
    }
    if (mask.combineMode === "add") result = Math.max(result, alpha);
    else if (mask.combineMode === "subtract") result *= 1 - alpha;
    else result *= alpha;
  });
  return clamp(result, 0, 1);
};

export const upsertMaskKeyframe = (
  mask: EditorEffectMask,
  property: MaskProperty,
  frame: number,
  value: number,
  options: {id?: string; easing?: MaskKeyframe["easing"]; confidence?: number} = {},
): EditorEffectMask => {
  const existing = mask.keyframes.find((keyframe) => keyframe.property === property && keyframe.frame === frame);
  const next: MaskKeyframe = {
    id: existing?.id ?? options.id ?? `${mask.id}-${property}-${frame}`,
    property,
    frame,
    value,
    easing: options.easing ?? existing?.easing ?? "linear",
    confidence: options.confidence ?? existing?.confidence,
  };
  return {
    ...mask,
    keyframes: [...mask.keyframes.filter((keyframe) => !(keyframe.property === property && keyframe.frame === frame)), next]
      .sort((left, right) => left.frame - right.frame || left.property.localeCompare(right.property)),
  };
};
