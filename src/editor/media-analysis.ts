import type {EditorClip, MediaAnalysis, ProjectMedia} from "./types";

export type MediaAnalysisApiStatus = MediaAnalysis;

export const normalizeMediaAnalysis = (value: unknown): MediaAnalysis | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<MediaAnalysis>;
  if (typeof candidate.id !== "string" || !/^[a-f0-9]{24}$/.test(candidate.id)) return undefined;
  if (!candidate.status || !["queued", "processing", "ready", "error"].includes(candidate.status)) return undefined;
  return {
    id: candidate.id,
    status: candidate.status,
    thumbnailUrl: typeof candidate.thumbnailUrl === "string" ? candidate.thumbnailUrl : undefined,
    waveform: Array.isArray(candidate.waveform)
      ? candidate.waveform.slice(0, 2048).map((peak) => typeof peak === "number" && Number.isFinite(peak) ? Math.max(0, Math.min(1, peak)) : 0)
      : undefined,
    generatedAt: typeof candidate.generatedAt === "number" && Number.isFinite(candidate.generatedAt) ? candidate.generatedAt : undefined,
    error: typeof candidate.error === "string" ? candidate.error.slice(0, 500) : undefined,
  };
};
export const sampleWaveform = (peaks: number[], fromRatio: number, toRatio: number, count = 96) => {
  if (!peaks.length || count < 1) return [];
  const start = Math.max(0, Math.min(peaks.length - 1, Math.floor(fromRatio * peaks.length)));
  const end = Math.max(start + 1, Math.min(peaks.length, Math.ceil(toRatio * peaks.length)));
  const span = end - start;
  return Array.from({length: count}, (_, index) => {
    const blockStart = start + Math.floor((index / count) * span);
    const blockEnd = Math.max(blockStart + 1, start + Math.ceil(((index + 1) / count) * span));
    let peak = 0;
    for (let cursor = blockStart; cursor < Math.min(end, blockEnd); cursor++) peak = Math.max(peak, peaks[cursor] ?? 0);
    return Math.max(.04, peak);
  });
};

export const waveformForClip = (clip: EditorClip, media: ProjectMedia | undefined, fps: number, count = 96) => {
  const peaks = media?.analysis?.status === "ready" ? media.analysis.waveform ?? [] : [];
  if (!peaks.length) return [];
  const sourceDurationFrames = Math.max(1, Math.round((media?.durationInSeconds ?? (media!.duration / fps)) * fps));
  const sourceStart = Math.max(0, clip.sourceStart);
  const sourceEnd = Math.min(sourceDurationFrames, sourceStart + clip.duration * Math.max(.1, clip.playbackRate ?? 1));
  return sampleWaveform(peaks, sourceStart / sourceDurationFrames, sourceEnd / sourceDurationFrames, count);
};
