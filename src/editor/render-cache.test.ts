import {describe, expect, it} from "vitest";
import {projectRenderFingerprint, usableRenderCache} from "./render-cache";
import {sampleProject} from "./project";

describe("render cache", () => {
  it("invalidates when a nested sequence changes", () => {
    const project = structuredClone(sampleProject);
    project.sequences = [{id: "nested", name: "Nested", width: project.width, height: project.height, fps: project.fps, markers: [], durationInFrames: 120, tracks: project.tracks, clips: structuredClone(project.clips), transitions: []}];
    const first = projectRenderFingerprint(project);
    project.sequences[0].clips[0].transform.x += 5;
    expect(projectRenderFingerprint(project)).not.toBe(first);
  });
  it("invalidates on render changes but ignores runtime media analysis", () => {
    const project = structuredClone(sampleProject);
    const first = projectRenderFingerprint(project);
    project.media[0].analysis = {id: "a".repeat(24), status: "ready", waveform: [.2]};
    expect(projectRenderFingerprint(project)).toBe(first);
    project.clips[0].transform.x += 1;
    expect(projectRenderFingerprint(project)).not.toBe(first);
  });

  it("accepts only a ready cache for the current render fingerprint", () => {
    const project = structuredClone(sampleProject);
    project.renderCache = {id: "cache-1234", fingerprint: projectRenderFingerprint(project), status: "ready", url: "/cache.mp4"};
    expect(usableRenderCache(project)).toBe(true);
    project.clips[0].duration += 1;
    expect(usableRenderCache(project)).toBe(false);
  });
});
