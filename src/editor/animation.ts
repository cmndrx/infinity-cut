import type {EditorClip, KeyframeProperty} from "./types";

const ease = (progress: number, easing: "linear" | "ease-in-out") => {
  if (easing === "linear") return progress;
  return progress * progress * (3 - 2 * progress);
};

export const getBasePropertyValue = (clip: EditorClip, property: KeyframeProperty) => {
  const [group, key] = property.split(".") as ["transform" | "effects" | "audio", string];
  if (group === "audio" && key === "volume") return clip.volume;
  if (group === "transform") return (clip.transform as unknown as Record<string, number>)[key];
  return (clip.effects as unknown as Record<string, number>)[key];
};

export const getAnimatedPropertyValue = (
  clip: EditorClip,
  property: KeyframeProperty,
  localFrame: number,
) => {
  const keyframes = (clip.keyframes ?? [])
    .filter((keyframe) => keyframe.property === property)
    .sort((a, b) => a.frame - b.frame);
  if (!keyframes.length) return getBasePropertyValue(clip, property);
  if (localFrame <= keyframes[0].frame) return keyframes[0].value;
  if (localFrame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value;

  const rightIndex = keyframes.findIndex((keyframe) => keyframe.frame >= localFrame);
  const left = keyframes[rightIndex - 1];
  const right = keyframes[rightIndex];
  const progress = (localFrame - left.frame) / Math.max(1, right.frame - left.frame);
  const interpolated = ease(progress, right.easing);
  return left.value + (right.value - left.value) * interpolated;
};

export const hasPropertyKeyframes = (clip: EditorClip, property: KeyframeProperty) =>
  (clip.keyframes ?? []).some((keyframe) => keyframe.property === property);

export const hasKeyframeAt = (clip: EditorClip, property: KeyframeProperty, localFrame: number) =>
  (clip.keyframes ?? []).some((keyframe) => keyframe.property === property && keyframe.frame === localFrame);
