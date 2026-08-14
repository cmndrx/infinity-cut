import {describe, expect, it} from "vitest";
import {DeclarativePluginRegistry, parsePluginManifest, pluginHasCapability, validatePluginManifest, type PluginManifest} from "./manifest";

const manifest = (): PluginManifest => ({
  schemaVersion: 1,
  apiVersion: 1,
  id: "com.example.looks",
  name: "Example Looks",
  version: "1.2.0",
  publisher: "Example",
  integrity: "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
  capabilities: ["effects.declare", "presets.declare"],
  contributions: [
    {id: "com.example.looks.effect.neon", kind: "effect", resource: "effects/neon.json", mediaType: "application/json"},
    {id: "com.example.looks.preset.neon", kind: "preset", resource: "presets/neon.json", mediaType: "application/json"},
  ],
});

describe("declarative plugin manifests", () => {
  it("validates registered manifests and capabilities", () => {
    const parsed = parsePluginManifest(JSON.stringify(manifest()));
    expect(pluginHasCapability(parsed, "effects.declare")).toBe(true);
    const registry = new DeclarativePluginRegistry();
    registry.register(parsed);
    expect(registry.getContributionOwner("com.example.looks.effect.neon")).toBe(parsed.id);
    expect(() => registry.register(parsed)).toThrow("already registered");
  });

  it("rejects executable fields, traversal, undeclared capabilities, and duplicate contributions", () => {
    expect(validatePluginManifest({...manifest(), entrypoint: "https://evil.test/plugin.js"}).valid).toBe(false);
    const traversal = manifest();
    traversal.contributions[0].resource = "../escape.json";
    expect(validatePluginManifest(traversal).valid).toBe(false);
    const missingCapability = manifest();
    missingCapability.capabilities = ["presets.declare"];
    expect(validatePluginManifest(missingCapability).issues.some((issue) => issue.message.includes("undeclared capability"))).toBe(true);
    const duplicate = manifest();
    duplicate.contributions[1].id = duplicate.contributions[0].id;
    expect(validatePluginManifest(duplicate).valid).toBe(false);
  });

  it("rejects unknown fields and oversized manifest text", () => {
    expect(validatePluginManifest({...manifest(), mystery: true}).valid).toBe(false);
    expect(() => parsePluginManifest("x".repeat(256_001))).toThrow("256 KB");
  });
});
