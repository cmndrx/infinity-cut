import type {EditorEffectMask} from "./types";
import {maskAtFrame, upsertMaskKeyframe} from "./masks";

export type GrayscaleFrame = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type TrackingResult = {
  dx: number;
  dy: number;
  confidence: number;
  samples: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const assertFrame = (frame: GrayscaleFrame) => {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0 || frame.data.length !== frame.width * frame.height) {
    throw new Error("Tracking frame dimensions do not match its grayscale payload");
  }
};

export const trackTemplateTranslation = (
  source: GrayscaleFrame,
  destination: GrayscaleFrame,
  region: {x: number; y: number; width: number; height: number},
  options: {searchRadius?: number; sampleStep?: number} = {},
): TrackingResult => {
  assertFrame(source);
  assertFrame(destination);
  if (source.width !== destination.width || source.height !== destination.height) throw new Error("Tracking frames must have the same dimensions");
  const searchRadius = clamp(Math.round(options.searchRadius ?? 24), 0, Math.max(source.width, source.height));
  const sampleStep = clamp(Math.round(options.sampleStep ?? 1), 1, 16);
  const x0 = clamp(Math.round(region.x), 0, source.width - 1);
  const y0 = clamp(Math.round(region.y), 0, source.height - 1);
  const width = clamp(Math.round(region.width), 1, source.width - x0);
  const height = clamp(Math.round(region.height), 1, source.height - y0);
  let best = {dx: 0, dy: 0, error: Number.POSITIVE_INFINITY, samples: 0};
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      let error = 0;
      let samples = 0;
      for (let y = 0; y < height; y += sampleStep) {
        const sourceY = y0 + y;
        const destinationY = sourceY + dy;
        if (destinationY < 0 || destinationY >= destination.height) continue;
        for (let x = 0; x < width; x += sampleStep) {
          const sourceX = x0 + x;
          const destinationX = sourceX + dx;
          if (destinationX < 0 || destinationX >= destination.width) continue;
          error += Math.abs(source.data[sourceY * source.width + sourceX] - destination.data[destinationY * destination.width + destinationX]);
          samples++;
        }
      }
      if (!samples) continue;
      const normalized = error / samples;
      if (normalized < best.error) best = {dx, dy, error: normalized, samples};
    }
  }
  if (!Number.isFinite(best.error)) return {dx: 0, dy: 0, confidence: 0, samples: 0};
  return {dx: best.dx, dy: best.dy, confidence: clamp(1 - best.error / 255, 0, 1), samples: best.samples};
};

export const trackingRegionForMask = (mask: EditorEffectMask, frameWidth: number, frameHeight: number, frame = 0) => {
  const resolved = maskAtFrame(mask, frame);
  const width = clamp(Math.round((resolved.width / 100) * frameWidth), 2, frameWidth);
  const height = clamp(Math.round((resolved.height / 100) * frameHeight), 2, frameHeight);
  return {
    x: clamp(Math.round((resolved.x / 100) * frameWidth - width / 2), 0, frameWidth - width),
    y: clamp(Math.round((resolved.y / 100) * frameHeight - height / 2), 0, frameHeight - height),
    width,
    height,
  };
};

export const applyTrackingResult = (
  mask: EditorEffectMask,
  frame: number,
  result: TrackingResult,
  frameWidth: number,
  frameHeight: number,
  minimumConfidence = 0.55,
) => {
  const previous = maskAtFrame(mask, Math.max(0, frame - 1));
  const accepted = result.confidence >= minimumConfidence;
  const x = accepted ? previous.x + (result.dx / frameWidth) * 100 : previous.x;
  const y = accepted ? previous.y + (result.dy / frameHeight) * 100 : previous.y;
  const withX = upsertMaskKeyframe(mask, "x", frame, x, {confidence: result.confidence});
  return upsertMaskKeyframe(withX, "y", frame, y, {confidence: result.confidence});
};

export const sourceTimeForTimelineFrame = (
  localFrame: number,
  sourceStart: number,
  playbackRate: number,
  fps: number,
) => (sourceStart + localFrame * playbackRate) / fps;
