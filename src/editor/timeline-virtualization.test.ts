import {describe, expect, it} from "vitest";
import {frameRangeIntersects, MAX_PIXELS_PER_FRAME, MIN_PIXELS_PER_FRAME, sliderToZoom, splitTimecodeLabel, timelineFrameWindow, timelineRulerTicks, visibleRulerSeconds, zoomToSlider} from "./timeline-virtualization";

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

describe("adaptive timeline ruler", () => {
  const window = {start: 0, end: 900};

  it("never lets major labels collide, whatever the zoom", () => {
    for (const pixelsPerFrame of [0.02, 0.1, 0.5, 1, 2, 4, 12, 48]) {
      const ticks = timelineRulerTicks(window, 30, pixelsPerFrame, 900);
      const gaps = ticks.major.slice(1).map((tick, index) => tick.x - ticks.major[index].x);
      expect(gaps.every((gap) => gap >= 90)).toBe(true);
    }
  });

  it("keeps grid subdivisions aligned to the major ticks", () => {
    const ticks = timelineRulerTicks(window, 30, 2, 900);
    expect(ticks.majorStep % ticks.minorStep).toBe(0);
    expect(ticks.minorStep * 2).toBeGreaterThanOrEqual(7);
    expect(ticks.major[0]).toMatchObject({frame: 0, x: 0});
  });

  it("drops to frame-accurate ticks when zoomed all the way in", () => {
    const ticks = timelineRulerTicks({start: 0, end: 60}, 30, 48, 60);
    expect(ticks.majorStep).toBeLessThan(30);
    expect(ticks.minorStep).toBe(1);
  });

  it("dims leading zero groups of the timecode label", () => {
    expect(splitTimecodeLabel(105, 30)).toEqual({dim: "00:00:", label: "03:15"});
    expect(splitTimecodeLabel(30 * 75, 30)).toEqual({dim: "00:", label: "01:15:00"});
  });

  it("maps the zoom slider logarithmically and round-trips", () => {
    expect(sliderToZoom(0)).toBeCloseTo(MIN_PIXELS_PER_FRAME);
    expect(sliderToZoom(1)).toBeCloseTo(MAX_PIXELS_PER_FRAME);
    expect(sliderToZoom(zoomToSlider(2.5))).toBeCloseTo(2.5);
  });
});
