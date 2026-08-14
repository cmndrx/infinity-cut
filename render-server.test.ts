import {describe, expect, it} from "vitest";
import {resolveRenderEncoding} from "./render-server";

describe("render encoding profiles", () => {
  it("maps delivery formats to compatible Remotion codec settings", () => {
    expect(resolveRenderEncoding("mp4", "standard")).toMatchObject({codec: "h264", extension: "mp4", audioCodec: "aac", pixelFormat: "yuv420p"});
    expect(resolveRenderEncoding("webm", "standard")).toMatchObject({codec: "vp9", extension: "webm", audioCodec: "opus"});
    expect(resolveRenderEncoding("hevc", "high")).toMatchObject({codec: "h265", extension: "mp4", audioCodec: "aac", crf: 18});
    expect(resolveRenderEncoding("prores", "high")).toMatchObject({codec: "prores", extension: "mov", audioCodec: "pcm-16", crf: null, pixelFormat: "yuv422p10le", proResProfile: "hq"});
  });

  it("uses lower-cost ProRes profiles for draft exports", () => {
    expect(resolveRenderEncoding("prores", "draft").proResProfile).toBe("proxy");
    expect(resolveRenderEncoding("prores", "standard").proResProfile).toBe("standard");
  });
});
