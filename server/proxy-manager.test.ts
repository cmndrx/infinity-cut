import {describe, expect, it} from "vitest";
import {buildProxyFfmpegArgs, proxyIdForSource} from "./proxy-manager";

describe("proxy manager", () => {
  it("creates stable source keys without exposing paths", () => {
    expect(proxyIdForSource("/api/media/a/Camera A.mov")).toBe(proxyIdForSource("/api/media/a/Camera A.mov"));
    expect(proxyIdForSource("/api/media/a/Camera A.mov")).not.toBe(proxyIdForSource("/api/media/b/Camera A.mov"));
    expect(proxyIdForSource("secret.mov")).toMatch(/^[a-f0-9]{24}$/);
  });

  it("builds an edit-friendly H.264 proxy with optional audio and no source overwrite", () => {
    const args = buildProxyFfmpegArgs("/original/camera.mov", "/cache/proxy.mp4");
    expect(args).toContain("libx264");
    expect(args).toContain("0:a?");
    expect(args).toContain("+faststart");
    expect(args.join(" ")).toContain("min(960,iw)");
    expect(args[args.length - 1]).toBe("/cache/proxy.mp4");
    expect(args).not.toContain("/original/camera.mov.tmp");
  });
});
