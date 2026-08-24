import {describe, expect, it} from "vitest";
import {frameRangeIntersects, timelineFrameWindow, visibleRulerSeconds} from "./timeline-virtualization";

describe("timeline virtualization", () => {
  it("converts the scroll viewport into an overscanned frame window", () => {
    expect(timelineFrameWindow({scrollLeft: 1_000, width: 800}, 2, 10_000, 200)).toEqual({start: 400, end: 1_000});
  });

  it("keeps intersecting clips and only nearby ruler seconds", () => {
    const window = {start: 300, end: 600};
    expect(frameRangeIntersects(250, 60, window)).toBe(true);
    expect(frameRangeIntersects(0, 100, window)).toBe(false);
    expect(visibleRulerSeconds(window, 30, 3_000)).toEqual(Array.from({length: 11}, (_, index) => 10 + index));
  });
});
