import {getVisualEffectDescriptor, validateVisualEffectInstance, type VisualEffectInstance} from "./registry";

export type EffectOverlay = {
  id: string;
  kind: "tint" | "duotone" | "progressive-blur" | "zoom-blur" | "halftone" | "scanlines" | "chromatic" | "noise" | "paper" | "light-leak";
  parameters: Record<string, number | boolean | string>;
};

export type EffectRenderPlan = {
  filter: string;
  transform: string;
  imageRendering?: "pixelated";
  clipPath?: string;
  overlays: EffectOverlay[];
  errors: string[];
};

const number = (parameters: VisualEffectInstance["parameters"], key: string) => Number(parameters[key] ?? 0);
const string = (parameters: VisualEffectInstance["parameters"], key: string) => String(parameters[key] ?? "");
const seeded = (seed: number, frame: number, salt: number) => {
  const value = Math.sin(seed * 12.9898 + frame * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

/** Converts the ordered effect stack to browser/Remotion-safe rendering primitives. */
export const buildEffectRenderPlan = (instances: readonly VisualEffectInstance[] | undefined, frame: number): EffectRenderPlan => {
  const filters: string[] = [];
  const transforms: string[] = [];
  const overlays: EffectOverlay[] = [];
  const errors: string[] = [];
  let imageRendering: EffectRenderPlan["imageRendering"];
  let clipPath: string | undefined;

  for (const instance of instances ?? []) {
    if (!instance.enabled) continue;
    const descriptor = getVisualEffectDescriptor(instance.descriptorId);
    if (!descriptor) {
      errors.push(`Missing effect: ${instance.descriptorId}`);
      continue;
    }
    if (!validateVisualEffectInstance(instance)) {
      errors.push(`Invalid effect settings: ${descriptor.name}`);
      continue;
    }
    const p = instance.parameters;
    switch (descriptor.renderKey) {
      case "brightness": filters.push(`brightness(${Math.max(0, 1 + number(p, "amount"))})`); break;
      case "contrast": filters.push(`contrast(${Math.max(0, 1 + number(p, "amount"))})`); break;
      case "saturation": filters.push(`saturate(${Math.max(0, number(p, "amount"))})`); break;
      case "hue": filters.push(`hue-rotate(${number(p, "degrees")}deg)`); break;
      case "grayscale": filters.push(`grayscale(${number(p, "amount")})`); break;
      case "invert": filters.push(`invert(${number(p, "amount")})`); break;
      case "blur": filters.push(`blur(${number(p, "radius")}px)`); break;
      case "glow": filters.push(`drop-shadow(0 0 ${number(p, "radius")}px rgba(255,255,255,${Math.min(1, number(p, "intensity") / 2)}))`); break;
      case "dropShadow": {
        const angle = number(p, "angle") * Math.PI / 180;
        const x = Math.cos(angle) * number(p, "distance");
        const y = Math.sin(angle) * number(p, "distance");
        filters.push(`drop-shadow(${x.toFixed(2)}px ${y.toFixed(2)}px ${number(p, "blur")}px ${string(p, "color")}${Math.round(number(p, "opacity") * 255).toString(16).padStart(2, "0")})`);
        break;
      }
      case "pixelate": imageRendering = "pixelated"; filters.push(`contrast(${1 + Math.min(0.24, number(p, "size") / 420)})`); break;
      case "barrelDistortion": {
        const amount = number(p, "amount");
        transforms.push(`scale(${1 + Math.abs(amount) * 0.12})`, `perspective(1200px) rotateX(${amount * 2}deg)`);
        clipPath = `ellipse(${Math.max(42, 50 - Math.abs(amount) * 7)}% ${Math.max(42, 50 - Math.abs(amount) * 7)}% at 50% 50%)`;
        break;
      }
      case "fisheye": {
        const amount = number(p, "amount");
        transforms.push(`scale(${1 + Math.abs(amount) * .18})`);
        clipPath = `circle(${Math.max(38, 50 - Math.abs(amount) * 8)}% at 50% 50%)`;
        break;
      }
      case "mirror": {
        const direction = string(p, "direction");
        transforms.push(direction === "vertical" ? "scaleY(-1)" : direction === "quad" ? "scale(-1,-1)" : "scaleX(-1)");
        break;
      }
      case "wave": {
        const phase = number(p, "phase") + frame * 0.04;
        const displacement = Math.sin(phase * number(p, "frequency")) * number(p, "amplitude");
        transforms.push(`translateX(${displacement.toFixed(3)}px)`, `skewY(${(displacement / 18).toFixed(3)}deg)`);
        break;
      }
      case "roughenEdges": {
        const amount = number(p, "amount");
        const seed = Math.round(number(p, "scale") * 17);
        const a = seeded(seed, frame, 1) * amount * 4;
        const b = seeded(seed, frame, 2) * amount * 4;
        clipPath = `polygon(${a.toFixed(2)}% ${b.toFixed(2)}%, ${100 - b}% ${a}%, ${100 - a}% ${100 - b}%, ${b}% ${100 - a}%)`;
        break;
      }
      case "tint": overlays.push({id: instance.id, kind: "tint", parameters: p}); break;
      case "duotone": overlays.push({id: instance.id, kind: "duotone", parameters: p}); break;
      case "linearProgressiveBlur": overlays.push({id: instance.id, kind: "progressive-blur", parameters: p}); break;
      case "zoomBlur": overlays.push({id: instance.id, kind: "zoom-blur", parameters: p}); break;
      case "halftone": overlays.push({id: instance.id, kind: "halftone", parameters: p}); break;
      case "scanlines": overlays.push({id: instance.id, kind: "scanlines", parameters: p}); break;
      case "chromaticAberration": overlays.push({id: instance.id, kind: "chromatic", parameters: p}); break;
      case "noise": overlays.push({id: instance.id, kind: "noise", parameters: {...p, frame}}); break;
      case "paper": overlays.push({id: instance.id, kind: "paper", parameters: {...p, frame}}); break;
      case "lightLeak": overlays.push({id: instance.id, kind: "light-leak", parameters: {...p, frame}}); break;
      default: errors.push(`No renderer for effect: ${descriptor.name}`);
    }
  }
  return {filter: filters.join(" "), transform: transforms.join(" "), imageRendering, clipPath, overlays, errors};
};

export const deterministicEffectNoise = seeded;
