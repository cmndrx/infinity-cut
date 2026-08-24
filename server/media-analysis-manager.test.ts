import {Buffer} from "node:buffer";
import {describe, expect, it} from "vitest";
import {analysisIdForSource, buildThumbnailArgs, buildWaveformArgs, peaksFromPcm16} from "./media-analysis-manager";

describe("media analysis manager", () => {
  it("uses stable private identifiers and bounded edit thumbnails", () => {
    expect(analysisIdForSource("/camera.mov")).toMatch(/^[a-f0-9]{24}$/);
    expect(buildThumbnailArgs("/camera.mov", "/cache/thumb.jpg", "video").join(" ")).toContain("min(640,iw)");
    expect(buildWaveformArgs("/camera.mov")).toContain("2000");
  });

  it("extracts deterministic normalized peaks from PCM", () => {
    const pcm = Buffer.alloc(8);
    pcm.writeInt16LE(0, 0); pcm.writeInt16LE(16384, 2); pcm.writeInt16LE(-32768, 4); pcm.writeInt16LE(8192, 6);
    expect(peaksFromPcm16(pcm, 2)).toEqual([.5, 1]);
  });
});
