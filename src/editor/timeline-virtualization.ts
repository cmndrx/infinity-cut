export type TimelineViewport = {scrollLeft: number; width: number};
export type TimelineFrameWindow = {start: number; end: number};

export const timelineFrameWindow = (viewport: TimelineViewport, pixelsPerFrame: number, durationInFrames: number, overscanPixels = 600): TimelineFrameWindow => {
  const safeScale = Math.max(.001, pixelsPerFrame);
  return {
    start: Math.max(0, Math.floor((viewport.scrollLeft - overscanPixels) / safeScale)),
    end: Math.min(durationInFrames, Math.ceil((viewport.scrollLeft + viewport.width + overscanPixels) / safeScale)),
  };
};
export const frameRangeIntersects = (start: number, duration: number, window: TimelineFrameWindow) => start + Math.max(1, duration) >= window.start && start <= window.end;

export const visibleRulerSeconds = (window: TimelineFrameWindow, fps: number, durationInFrames: number) => {
  const first = Math.max(0, Math.floor(window.start / fps));
  const last = Math.min(Math.ceil(durationInFrames / fps), Math.ceil(window.end / fps));
  return Array.from({length: Math.max(0, last - first + 1)}, (_, index) => first + index);
};

/* ------------------------------------------------------------------
   Adaptive ruler: picks a "nice" major interval so labels never collide,
   and a minor subdivision that stays legible at every zoom level. The
   lane grid is drawn from the same ticks, so it always lines up with
   the timecode above it.
   ------------------------------------------------------------------ */
export const MIN_PIXELS_PER_FRAME = 0.005;
export const MAX_PIXELS_PER_FRAME = 48;
const MIN_LABEL_SPACING = 92;
const MIN_MINOR_SPACING = 7;

export type RulerTick = {frame: number; x: number};
export type RulerMajorTick = RulerTick & {dim: string; label: string};
export type TimelineRulerTicks = {majorStep: number; minorStep: number; major: RulerMajorTick[]; minor: RulerTick[]};

const niceSteps = (fps: number) => {
  const nominal = Math.max(1, Math.round(fps));
  const frameSteps = [1, 2, 5, 10].filter((step) => step < nominal);
  if (nominal % 2 === 0 && nominal / 2 > 10) frameSteps.push(nominal / 2);
  const seconds = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
  return [...frameSteps, ...seconds.map((second) => second * nominal)];
};

const minorDivisions = (majorStep: number, nominal: number) => {
  if (majorStep <= 1) return [1];
  if (majorStep < nominal) return [majorStep, majorStep / 2, majorStep / 5, 1].filter((step) => Number.isInteger(step) && step >= 1);
  const seconds = majorStep / nominal;
  const candidates = seconds >= 60 ? [seconds / 2, seconds / 4, seconds / 6, seconds / 10, seconds / 12] : [seconds / 2, seconds / 5, seconds / 10, 1 / 2, 1 / 5, 1 / 10];
  return [...candidates.map((value) => value * nominal), 1].filter((step) => Number.isInteger(step) && step >= 1 && step < majorStep);
};

/** Splits a timecode into a dimmed leading-zero prefix and the significant tail. */
export const splitTimecodeLabel = (frame: number, fps: number) => {
  const nominal = Math.max(1, Math.round(fps));
  const safe = Math.max(0, Math.round(frame));
  const totalSeconds = Math.floor(safe / fps);
  const parts = [Math.floor(totalSeconds / 3600), Math.floor((totalSeconds / 60) % 60), totalSeconds % 60, Math.min(nominal - 1, Math.max(0, Math.round(safe - totalSeconds * fps)))].map((part) => String(part).padStart(2, "0"));
  let lead = 0;
  while (lead < 2 && parts[lead] === "00") lead += 1;
  return {dim: parts.slice(0, lead).map((part) => `${part}:`).join(""), label: parts.slice(lead).join(":")};
};

export const timelineRulerTicks = (window: TimelineFrameWindow, fps: number, pixelsPerFrame: number, lastFrame: number): TimelineRulerTicks => {
  const nominal = Math.max(1, Math.round(fps));
  const scale = Math.max(.0001, pixelsPerFrame);
  const steps = niceSteps(fps);
  const majorStep = steps.find((step) => step * scale >= MIN_LABEL_SPACING) ?? steps[steps.length - 1];
  const minorStep = minorDivisions(majorStep, nominal).filter((step) => step * scale >= MIN_MINOR_SPACING).pop() ?? majorStep;
  const start = Math.max(0, window.start);
  const end = Math.max(start, Math.min(lastFrame, window.end));
  const major: RulerMajorTick[] = [];
  const minor: RulerTick[] = [];
  for (let frame = Math.floor(start / minorStep) * minorStep; frame <= end; frame += minorStep) {
    const x = Math.round(frame * scale);
    if (frame % majorStep === 0) major.push({frame, x, ...splitTimecodeLabel(frame, fps)});
    else minor.push({frame, x});
  }
  return {majorStep, minorStep, major, minor};
};

/** Slider position (0..1) <-> pixels-per-frame on a logarithmic curve, so every notch feels equally strong. */
export const zoomToSlider = (pixelsPerFrame: number, min = MIN_PIXELS_PER_FRAME, max = MAX_PIXELS_PER_FRAME) => (Math.log(clampZoom(pixelsPerFrame, min, max)) - Math.log(min)) / (Math.log(max) - Math.log(min));
export const sliderToZoom = (position: number, min = MIN_PIXELS_PER_FRAME, max = MAX_PIXELS_PER_FRAME) => Math.exp(Math.log(min) + Math.min(1, Math.max(0, position)) * (Math.log(max) - Math.log(min)));
export const clampZoom = (pixelsPerFrame: number, min = MIN_PIXELS_PER_FRAME, max = MAX_PIXELS_PER_FRAME) => Math.min(max, Math.max(min, pixelsPerFrame));
