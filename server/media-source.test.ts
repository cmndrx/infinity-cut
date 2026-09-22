import path from "node:path";
import {describe, expect, it} from "vitest";
import {resolveMediaSourcePath} from "./media-source";

describe("export media paths", () => {
  const root = path.resolve("fixture-project");
  const staged = path.join(root, "data", "media");
  const resolve = (src: string) => resolveMediaSourcePath(src, root, staged);
  it("resolves root-relative and relative public assets under public", () => {
    expect(resolve("/audio/score.wav")).toBe(path.join(root, "public/audio/score.wav"));
    expect(resolve("trailers/intro.mp4")).toBe(path.join(root, "public/trailers/intro.mp4"));
  });
  it("decodes URL paths and ignores URL query parameters", () => {
    expect(resolve("/audio/My%20Score.wav?v=2")).toBe(path.join(root, "public/audio/My Score.wav"));
  });
  it("resolves uploaded assets using the upload filename convention", () => {
    expect(resolve("/api/media/abc-123/My%20Clip.mp4")).toBe(path.join(staged, "abc-123-My-Clip.mp4"));
  });
  it("retains HTTP sources", () => {
    expect(resolve("https://example.com/clip.mp4?v=1")).toBe("https://example.com/clip.mp4?v=1");
  });
  it("rejects traversal, unknown API paths and unsupported URL schemes", () => {
    for (const source of ["/../secret.wav", "/%2e%2e/secret.wav", "/api/other/clip.wav", "file:///etc/passwd", "blob:temporary"]) {
      expect(() => resolve(source)).toThrow();
    }
  });
});
