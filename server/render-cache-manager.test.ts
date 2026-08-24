import {describe, expect, it} from "vitest";
import {sampleProject} from "../src/editor/project";
import {renderCacheId} from "./render-cache-manager";

describe("render cache manager", () => {
  it("keys cache artifacts to render-relevant project state", () => {
    const first = structuredClone(sampleProject);
    const second = structuredClone(sampleProject);
    expect(renderCacheId(first)).toMatch(/^cache-[a-f0-9]{8}$/);
    expect(renderCacheId(second)).toBe(renderCacheId(first));
    second.clips[0].effects.contrast += 1;
    expect(renderCacheId(second)).not.toBe(renderCacheId(first));
  });
});
