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
