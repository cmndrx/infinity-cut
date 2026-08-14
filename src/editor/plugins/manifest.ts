export const PLUGIN_API_VERSION = 1 as const;

export const PLUGIN_CAPABILITIES = [
  "effects.declare",
  "transitions.declare",
  "presets.declare",
  "templates.declare",
  "assets.read",
] as const;
export type PluginCapability = typeof PLUGIN_CAPABILITIES[number];
export type PluginContributionKind = "effect" | "transition" | "preset" | "template" | "asset";
export type PluginContribution = {id: string; kind: PluginContributionKind; resource: string; mediaType: "application/json" | "image/png" | "image/jpeg" | "font/woff2" | "application/zip"};
export type PluginManifest = {
  schemaVersion: 1;
  apiVersion: typeof PLUGIN_API_VERSION;
  id: string;
  name: string;
  version: string;
  publisher: string;
  integrity: string;
  capabilities: PluginCapability[];
  contributions: PluginContribution[];
};
export type PluginManifestIssue = {path: string; message: string};

const manifestKeys = new Set(["schemaVersion", "apiVersion", "id", "name", "version", "publisher", "integrity", "capabilities", "contributions"]);
const contributionKeys = new Set(["id", "kind", "resource", "mediaType"]);
const executableKeys = new Set(["entrypoint", "entryPoint", "script", "code", "module", "javascript", "eval", "worker", "iframe", "url"]);
const idPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const integrityPattern = /^sha256-[A-Za-z0-9+/]{43}=$/;
const resourcePattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const mediaTypes = new Set(["application/json", "image/png", "image/jpeg", "font/woff2", "application/zip"]);
const contributionKinds = new Set(["effect", "transition", "preset", "template", "asset"]);
const capabilitySet = new Set<string>(PLUGIN_CAPABILITIES);

const plainRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const hasExecutableField = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasExecutableField);
  return Object.entries(value).some(([key, item]) => executableKeys.has(key) || ["__proto__", "prototype", "constructor"].includes(key) || hasExecutableField(item));
};

const requiredCapability = (kind: PluginContributionKind): PluginCapability => kind === "effect" ? "effects.declare"
  : kind === "transition" ? "transitions.declare"
    : kind === "preset" ? "presets.declare"
      : kind === "template" ? "templates.declare"
        : "assets.read";

export const validatePluginManifest = (value: unknown): {valid: boolean; issues: PluginManifestIssue[]} => {
  const issues: PluginManifestIssue[] = [];
  if (!plainRecord(value)) return {valid: false, issues: [{path: "manifest", message: "Plugin manifest must be an object"}]};
  if (hasExecutableField(value)) issues.push({path: "manifest", message: "Executable plugin fields are not allowed"});
  Object.keys(value).forEach((key) => {
    if (!manifestKeys.has(key)) issues.push({path: key, message: "Unknown manifest field"});
  });
  if (value.schemaVersion !== 1) issues.push({path: "schemaVersion", message: "Unsupported manifest schema"});
  if (value.apiVersion !== PLUGIN_API_VERSION) issues.push({path: "apiVersion", message: "Unsupported plugin API version"});
  if (typeof value.id !== "string" || !idPattern.test(value.id) || value.id.length > 128) issues.push({path: "id", message: "Plugin id must be a reverse-domain identifier"});
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 120) issues.push({path: "name", message: "Plugin name is invalid"});
  if (typeof value.publisher !== "string" || !value.publisher.trim() || value.publisher.length > 120) issues.push({path: "publisher", message: "Publisher is invalid"});
  if (typeof value.version !== "string" || !semverPattern.test(value.version)) issues.push({path: "version", message: "Version must use semantic versioning"});
  if (typeof value.integrity !== "string" || !integrityPattern.test(value.integrity)) issues.push({path: "integrity", message: "Integrity must be a SHA-256 digest"});
  if (!Array.isArray(value.capabilities) || value.capabilities.length > PLUGIN_CAPABILITIES.length) issues.push({path: "capabilities", message: "Capabilities must be an array"});
  const capabilities = new Set<string>();
  if (Array.isArray(value.capabilities)) value.capabilities.forEach((capability, index) => {
    if (typeof capability !== "string" || !capabilitySet.has(capability) || capabilities.has(capability)) issues.push({path: `capabilities.${index}`, message: "Capability is unknown or duplicated"});
    else capabilities.add(capability);
  });
  if (!Array.isArray(value.contributions) || value.contributions.length > 256) issues.push({path: "contributions", message: "Contributions must be an array with at most 256 entries"});
  const contributionIds = new Set<string>();
  if (Array.isArray(value.contributions)) value.contributions.forEach((contribution, index) => {
    const path = `contributions.${index}`;
    if (!plainRecord(contribution)) {
      issues.push({path, message: "Contribution must be an object"});
      return;
    }
    Object.keys(contribution).forEach((key) => {
      if (!contributionKeys.has(key)) issues.push({path: `${path}.${key}`, message: "Unknown contribution field"});
    });
    const id = String(contribution.id ?? "");
    if (!idPattern.test(id) || contributionIds.has(id)) issues.push({path: `${path}.id`, message: "Contribution id is invalid or duplicated"});
    contributionIds.add(id);
    if (typeof contribution.kind !== "string" || !contributionKinds.has(contribution.kind)) issues.push({path: `${path}.kind`, message: "Contribution kind is invalid"});
    else if (!capabilities.has(requiredCapability(contribution.kind as PluginContributionKind))) issues.push({path: `${path}.kind`, message: "Contribution requires an undeclared capability"});
    if (typeof contribution.resource !== "string" || !resourcePattern.test(contribution.resource) || contribution.resource.includes(":")) issues.push({path: `${path}.resource`, message: "Resource must be a relative plugin path"});
    if (typeof contribution.mediaType !== "string" || !mediaTypes.has(contribution.mediaType)) issues.push({path: `${path}.mediaType`, message: "Resource media type is not allowed"});
    if (["effect", "transition", "preset", "template"].includes(String(contribution.kind)) && contribution.mediaType !== "application/json") issues.push({path: `${path}.mediaType`, message: "Declarative contributions must use JSON"});
  });
  return {valid: issues.length === 0, issues};
};

export const parsePluginManifest = (source: string | unknown): PluginManifest => {
  if (typeof source === "string" && source.length > 256_000) throw new Error("Plugin manifest exceeds the 256 KB limit");
  let parsed: unknown;
  try {
    parsed = typeof source === "string" ? JSON.parse(source) : source;
  } catch {
    throw new Error("Plugin manifest is not valid JSON");
  }
  const validation = validatePluginManifest(parsed);
  if (!validation.valid) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  return JSON.parse(JSON.stringify(parsed)) as PluginManifest;
};

export const pluginHasCapability = (manifest: PluginManifest, capability: PluginCapability) => manifest.capabilities.includes(capability);

export class DeclarativePluginRegistry {
  private readonly manifests = new Map<string, PluginManifest>();
  private readonly contributionOwners = new Map<string, string>();

  register(source: string | unknown) {
    const manifest = parsePluginManifest(source);
    if (this.manifests.has(manifest.id)) throw new Error(`Plugin ${manifest.id} is already registered`);
    for (const contribution of manifest.contributions) {
      if (this.contributionOwners.has(contribution.id)) throw new Error(`Contribution ${contribution.id} is already registered`);
    }
    this.manifests.set(manifest.id, manifest);
    manifest.contributions.forEach((contribution) => this.contributionOwners.set(contribution.id, manifest.id));
    return manifest;
  }

  getPlugin(id: string) {
    return this.manifests.get(id);
  }

  getContributionOwner(id: string) {
    return this.contributionOwners.get(id);
  }

  list() {
    return [...this.manifests.values()];
  }
}
