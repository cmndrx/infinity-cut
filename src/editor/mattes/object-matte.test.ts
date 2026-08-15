import {describe, expect, it, vi} from "vitest";
import {importObjectMatteSequence, matteFrameAt, normalizeObjectMatte, ObjectMaskProviderRegistry, ObjectMatteCache} from "./object-matte";

const matte = () => normalizeObjectMatte({
  id: "person", name: "Person", source: "imported", enabled: true, inverted: false, opacity: .8,
  frames: [{frame: 10, src: "/mattes/0010.png"}, {frame: 0, src: "/mattes/0000.png"}],
});

describe("object mattes", () => {
  it("normalizes imported frame sequences and holds the nearest previous frame", () => {
    const value = matte();
    expect(value.frames.map((item) => item.frame)).toEqual([0, 10]);
    expect(matteFrameAt(value, 9)?.src).toBe("/mattes/0000.png");
    expect(matteFrameAt(value, 10)?.src).toBe("/mattes/0010.png");
  });

  it("rejects executable URLs and empty sequences", () => {
    expect(() => normalizeObjectMatte({id: "bad", frames: [{frame: 0, src: "javascript:alert(1)"}]})).toThrow("at least one");
  });

  it("imports naturally sorted numbered image sequences", () => {
    const imported = importObjectMatteSequence({id: "hero", name: "Hero", files: [
      {name: "hero_0010.png", src: "/hero_0010.png"},
      {name: "hero_0002.png", src: "/hero_0002.png"},
    ]});
    expect(imported.frames.map((item) => item.frame)).toEqual([2, 10]);
  });

  it("supports a deterministic cache and an explicit provider boundary", async () => {
    const cache = new ObjectMatteCache();
    cache.put(matte());
    expect(cache.get("person")?.opacity).toBe(.8);
    const registry = new ObjectMaskProviderRegistry();
    const createMatte = vi.fn(async () => ({...matte(), source: "provider" as const, providerId: "local.test"}));
    registry.register({id: "local.test", label: "Local Test", createMatte});
    const result = await registry.create("local.test", {clipId: "clip", source: "/clip.mp4", startFrame: 0, endFrame: 10, fps: 30});
    expect(result.providerId).toBe("local.test");
    expect(createMatte).toHaveBeenCalledOnce();
    await expect(registry.create("missing", {clipId: "clip", source: "/clip.mp4", startFrame: 0, endFrame: 10, fps: 30})).rejects.toThrow("unavailable");
  });
});
