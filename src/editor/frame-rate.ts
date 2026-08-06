import type {EditorProject, ProjectMedia} from "./types";

const COMMON_FRAME_RATES = [23.976, 24, 25, 29.97, 30, 47.952, 48, 50, 59.94, 60, 100, 119.88, 120];

export const normalizeFrameRate = (value: number | null | undefined): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const common = COMMON_FRAME_RATES.find((candidate) => Math.abs(candidate - value) <= Math.max(0.01, candidate * 0.0005));
  return common ?? Number(value.toFixed(3));
};

export const formatFrameRate = (value: number) => Number.isInteger(value)
  ? String(value)
  : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");

export const frameRatesMatch = (left: number, right: number) => Math.abs(left - right) < 0.01;

const scaleFrame = (value: number, ratio: number, minimum = 0) => Math.max(minimum, Math.round(value * ratio));

export const conformMediaToFrameRate = (media: ProjectMedia, fps: number): ProjectMedia => ({
  ...media,
  duration: media.durationInSeconds
    ? Math.max(2, Math.round(media.durationInSeconds * fps))
    : media.duration,
});

export const retimeProjectForFrameRate = (project: EditorProject, requestedFps: number): EditorProject => {
  const nextFps = normalizeFrameRate(requestedFps);
  if (!nextFps || frameRatesMatch(project.fps, nextFps)) return {...project, fps: nextFps ?? project.fps};

  const ratio = nextFps / project.fps;
  return {
    ...project,
    fps: nextFps,
    durationInFrames: scaleFrame(project.durationInFrames, ratio, 1),
    media: project.media.map((item) => item.durationInSeconds
      ? conformMediaToFrameRate(item, nextFps)
      : {...item, duration: scaleFrame(item.duration, ratio, 2)}),
    clips: project.clips.map((clip) => ({
      ...clip,
      start: scaleFrame(clip.start, ratio),
      duration: scaleFrame(clip.duration, ratio, 2),
      sourceStart: scaleFrame(clip.sourceStart, ratio),
      fadeIn: scaleFrame(clip.fadeIn, ratio),
      fadeOut: scaleFrame(clip.fadeOut, ratio),
      keyframes: clip.keyframes.map((keyframe) => ({...keyframe, frame: scaleFrame(keyframe.frame, ratio)})),
    })),
    markers: project.markers.map((marker) => ({...marker, frame: scaleFrame(marker.frame, ratio)})),
    transitions: project.transitions.map((transition) => ({...transition, duration: scaleFrame(transition.duration, ratio, 2)})),
  };
};
