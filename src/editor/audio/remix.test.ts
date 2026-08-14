import {describe, expect, it} from "vitest";
import {createRemixPlan, validateRemixPlan, type RemixAnalysis} from "./remix";

const analysis: RemixAnalysis = {
  version: 1,
  durationInFrames: 360,
  beats: Array.from({length: 11}, (_, index) => ({frame: (index + 1) * 30, strength: ((index * 7) % 10) / 10, section: index < 4 ? "verse" : index < 8 ? "chorus" : "outro"})),
};

describe("deterministic music Remix", () => {
  it("returns an identical stored plan for identical inputs", () => {
    const options = {targetDurationInFrames: 620, crossfadeInFrames: 6, minSegmentInFrames: 45, seed: "campaign-a"};
    const first = createRemixPlan(analysis, options);
    expect(JSON.stringify(createRemixPlan(analysis, options))).toBe(JSON.stringify(first));
    expect(validateRemixPlan(first)).toBe(true);
    const last = first.segments[first.segments.length - 1];
    expect(last.timelineStartFrame + last.durationInFrames).toBe(620);
    expect(first.segments.length).toBeGreaterThan(1);
  });

  it("creates exact, in-bounds shortened plans", () => {
    const plan = createRemixPlan(analysis, {targetDurationInFrames: 137, crossfadeInFrames: 5, seed: "short"});
    expect(validateRemixPlan(plan)).toBe(true);
    expect(plan.segments.every((segment) => segment.sourceStartFrame + segment.sourceDurationInFrames <= analysis.durationInFrames)).toBe(true);
    const last = plan.segments[plan.segments.length - 1];
    expect(last.timelineStartFrame + last.durationInFrames).toBe(137);
  });

  it("rejects malformed analysis and impossible target durations", () => {
    expect(() => createRemixPlan({...analysis, durationInFrames: 0}, {targetDurationInFrames: 20})).toThrow("Invalid Remix analysis");
    expect(() => createRemixPlan(analysis, {targetDurationInFrames: 0})).toThrow("positive frame count");
  });
});
