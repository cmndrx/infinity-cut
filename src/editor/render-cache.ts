import type {EditorProject, TimelineRenderCache} from "./types";

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};

export const projectRenderFingerprint = (project: EditorProject) => {
  const renderState = {
    rendererVersion: 5,
    activeSequenceId: project.activeSequenceId,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationInFrames: project.durationInFrames,
    tracks: project.tracks,
    clips: project.clips,
    transitions: project.transitions,
    sequences: project.sequences,
    luts: project.luts,
    audioSettings: project.audioSettings,
    media: project.media.map(({id, src, offline}) => ({id, src, offline})),
  };
  const source = stableStringify(renderState);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const normalizeRenderCache = (value: unknown): TimelineRenderCache | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<TimelineRenderCache>;
  if (typeof candidate.id !== "string" || !/^[a-f0-9-]{8,}$/.test(candidate.id)) return undefined;
  if (typeof candidate.fingerprint !== "string" || !/^[a-f0-9]{8}$/.test(candidate.fingerprint)) return undefined;
  if (!candidate.status || !["queued", "rendering", "ready", "error"].includes(candidate.status)) return undefined;
  if (candidate.status === "ready" && !candidate.url) return undefined;
  return {
    id: candidate.id,
    fingerprint: candidate.fingerprint,
    status: candidate.status,
    url: typeof candidate.url === "string" ? candidate.url : undefined,
    generatedAt: typeof candidate.generatedAt === "number" && Number.isFinite(candidate.generatedAt) ? candidate.generatedAt : undefined,
    fileSize: typeof candidate.fileSize === "number" && Number.isFinite(candidate.fileSize) ? Math.max(0, Math.round(candidate.fileSize)) : undefined,
    error: typeof candidate.error === "string" ? candidate.error.slice(0, 500) : undefined,
  };
};

export const usableRenderCache = (project: EditorProject) => project.renderCache?.status === "ready"
  && project.renderCache.fingerprint === projectRenderFingerprint(project)
  && Boolean(project.renderCache.url);
