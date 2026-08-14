import {describe, expect, it} from "vitest";
import {createDefaultMask, getAnimatedMaskProperty} from "./masks";
import {applyTrackingResult, sourceTimeForTimelineFrame, trackTemplateTranslation, type GrayscaleFrame} from "./tracking";

const patternedFrame = (offsetX: number, offsetY: number): GrayscaleFrame => {
  const width = 12;
  const height = 12;
  const data = new Uint8Array(width * height);
  const pattern = [30, 90, 150, 210, 60, 180, 120, 240, 75];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) data[(4 + offsetY + y) * width + 3 + offsetX + x] = pattern[y * 3 + x];
  return {width, height, data};
};

describe("deterministic mask tracking", () => {
  it("finds a known integer translation in both directions", () => {
    const source = patternedFrame(0, 0);
    const destination = patternedFrame(2, -1);
    expect(trackTemplateTranslation(source, destination, {x: 3, y: 4, width: 3, height: 3}, {searchRadius: 3})).toMatchObject({dx: 2, dy: -1, confidence: 1});
    expect(trackTemplateTranslation(destination, source, {x: 5, y: 3, width: 3, height: 3}, {searchRadius: 3})).toMatchObject({dx: -2, dy: 1, confidence: 1});
  });

  it("emits stable x/y keyframes and holds on low confidence", () => {
    const mask = createDefaultMask("track");
    const moved = applyTrackingResult(mask, 1, {dx: 2, dy: -1, confidence: 1, samples: 9}, 12, 12);
    expect(getAnimatedMaskProperty(moved, "x", 1)).toBeCloseTo(66.6667, 3);
    expect(getAnimatedMaskProperty(moved, "y", 1)).toBeCloseTo(41.6667, 3);
    const held = applyTrackingResult(mask, 1, {dx: 5, dy: 5, confidence: 0.2, samples: 9}, 12, 12);
    expect(getAnimatedMaskProperty(held, "x", 1)).toBe(50);
    expect(held.keyframes.every((keyframe) => keyframe.confidence === 0.2)).toBe(true);
  });

  it("maps retimed timeline frames to exact source time", () => {
    expect(sourceTimeForTimelineFrame(30, 15, 2, 30)).toBe(2.5);
  });
});
