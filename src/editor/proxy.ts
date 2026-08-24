import type {EditorClip, ProjectMedia} from "./types";

export type ProxyApiStatus = NonNullable<ProjectMedia["proxy"]>;

export const normalizeMediaProxy = (value: unknown): ProjectMedia["proxy"] => {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<ProxyApiStatus>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return undefined;
  if (!candidate.status || !["queued", "processing", "ready", "error"].includes(candidate.status)) return undefined;
  if (candidate.status === "ready" && (typeof candidate.url !== "string" || !candidate.url)) return undefined;
  return {
    id: candidate.id,
    status: candidate.status,
    url: typeof candidate.url === "string" ? candidate.url : undefined,
    width: typeof candidate.width === "number" && Number.isFinite(candidate.width) && candidate.width > 0 ? Math.round(candidate.width) : undefined,
    height: typeof candidate.height === "number" && Number.isFinite(candidate.height) && candidate.height > 0 ? Math.round(candidate.height) : undefined,
    fileSize: typeof candidate.fileSize === "number" && Number.isFinite(candidate.fileSize) && candidate.fileSize >= 0 ? Math.round(candidate.fileSize) : undefined,
    generatedAt: typeof candidate.generatedAt === "number" && Number.isFinite(candidate.generatedAt) ? candidate.generatedAt : undefined,
    error: typeof candidate.error === "string" ? candidate.error.slice(0, 500) : undefined,
  };
};

export const proxyReady = (media: ProjectMedia | undefined) => media?.proxy?.status === "ready" && Boolean(media.proxy.url);

export const resolveClipPreviewSource = (clip: Pick<EditorClip, "src" | "sourceMediaId">, media: ProjectMedia[], useProxies: boolean) => {
  if (!useProxies || !clip.sourceMediaId) return clip.src;
  const source = media.find((item) => item.id === clip.sourceMediaId);
  return proxyReady(source) ? source!.proxy!.url : clip.src;
};

export const resolveMediaPreviewSource = (media: ProjectMedia, useProxies: boolean) => useProxies && proxyReady(media) ? media.proxy!.url! : media.src;
