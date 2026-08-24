import {describe, expect, it} from "vitest";
import {normalizeMediaProxy, resolveClipPreviewSource, resolveMediaPreviewSource} from "./proxy";
import type {EditorClip, ProjectMedia} from "./types";

const media = (updates: Partial<ProjectMedia> = {}): ProjectMedia => ({
  id: "media", name: "Camera", kind: "video", src: "/api/media/original/camera.mov", duration: 90, color: "#fff", binId: "bin-video", ...updates,
});
const clip = {src: "/api/media/original/camera.mov", sourceMediaId: "media"} as EditorClip;

describe("proxy preview resolution", () => {
  it("uses a ready proxy only when preview proxies are enabled", () => {
    const source = media({proxy: {id: "proxy", status: "ready", url: "/api/proxies/proxy/file"}});
    expect(resolveClipPreviewSource(clip, [source], true)).toBe("/api/proxies/proxy/file");
    expect(resolveClipPreviewSource(clip, [source], false)).toBe(clip.src);
    expect(resolveMediaPreviewSource(source, true)).toBe("/api/proxies/proxy/file");
  });

  it("falls back to the original while proxy work is incomplete or invalid", () => {
    expect(resolveClipPreviewSource(clip, [media({proxy: {id: "proxy", status: "processing"}})], true)).toBe(clip.src);
    expect(normalizeMediaProxy({id: "proxy", status: "ready"})).toBeUndefined();
    expect(normalizeMediaProxy({id: "proxy", status: "processing", width: 640.4})).toMatchObject({status: "processing", width: 640});
  });
});
