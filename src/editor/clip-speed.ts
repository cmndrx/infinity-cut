import type {EditorClip, EditorProject} from "./types";

export const MIN_PLAYBACK_RATE = 0.1;
export const MAX_PLAYBACK_RATE = 10;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const getClipPlaybackRate = (clip: Pick<EditorClip, "playbackRate">) => {
  const value = clip.playbackRate ?? 1;
  return Number.isFinite(value) ? clamp(value, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE) : 1;
};

export const getClipSourceSpan = (clip: Pick<EditorClip, "duration" | "playbackRate">) => clip.duration * getClipPlaybackRate(clip);

export const playbackRateForDuration = (clip: Pick<EditorClip, "duration" | "playbackRate">, requestedDuration: number) => {
  const duration = Math.max(2, Math.round(requestedDuration));
  return clamp(getClipSourceSpan(clip) / duration, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
};

export const retimeClipForPlaybackRate = (clip: EditorClip, requestedRate: number, preservePitch = clip.preservePitch ?? true): EditorClip => {
  const playbackRate = clamp(Number.isFinite(requestedRate) ? requestedRate : 1, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
  const duration = Math.max(2, Math.round(getClipSourceSpan(clip) / playbackRate));
  const timelineRatio = duration / Math.max(1, clip.duration);

  return {
    ...clip,
    playbackRate,
    preservePitch,
    duration,
    fadeIn: Math.min(duration, Math.round(clip.fadeIn * timelineRatio)),
    fadeOut: Math.min(duration, Math.round(clip.fadeOut * timelineRatio)),
    keyframes: clip.keyframes
      .map((keyframe) => ({...keyframe, frame: Math.round(keyframe.frame * timelineRatio)}))
      .filter((keyframe) => keyframe.frame >= 0 && keyframe.frame < duration),
  };
};

export const applyClipSpeed = (
  project: EditorProject,
  clipId: string,
  requestedRate: number,
  options: {ripple: boolean; preservePitch: boolean},
): EditorProject => {
  const original = project.clips.find((clip) => clip.id === clipId);
  if (!original) return project;

  const retimed = retimeClipForPlaybackRate(original, requestedRate, options.preservePitch);
  const originalEnd = original.start + original.duration;
  const durationDelta = retimed.duration - original.duration;
  const clips = project.clips.map((clip) => {
    if (clip.id === clipId) return retimed;
    if (options.ripple && clip.trackId === original.trackId && clip.start >= originalEnd) {
      return {...clip, start: Math.max(0, clip.start + durationDelta)};
    }
    return clip;
  });

  return {
    ...project,
    clips,
    durationInFrames: Math.max(project.durationInFrames, ...clips.map((clip) => clip.start + clip.duration)),
  };
};
