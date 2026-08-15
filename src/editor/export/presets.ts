import type {ExportPreset} from "./types";

export const BUILT_IN_EXPORT_PRESETS: readonly ExportPreset[] = [
  {id: "web-h264", name: "Web · H.264", description: "Balanced MP4 for web delivery", format: "mp4", quality: "standard", resolution: "source", builtIn: true},
  {id: "review-720", name: "Review · 720p", description: "Compact MP4 for review links", format: "mp4", quality: "draft", resolution: "720p", builtIn: true},
  {id: "master-prores", name: "Master · ProRes 422 HQ", description: "10-bit mezzanine master with PCM audio", format: "prores", quality: "high", resolution: "source", builtIn: true},
  {id: "delivery-hevc", name: "Delivery · HEVC", description: "High-efficiency H.265 delivery file", format: "hevc", quality: "high", resolution: "source", builtIn: true},
  {id: "archive-png", name: "Archive · PNG Sequence", description: "Lossless frame sequence packaged as ZIP", format: "png-sequence", quality: "high", resolution: "source", builtIn: true},
  {id: "audio-wav", name: "Audio · WAV Mix", description: "Lossless PCM master mix", format: "wav", quality: "high", resolution: "source", builtIn: true},
  {id: "audio-stems", name: "Audio · Track Stems", description: "One lossless WAV per audio track, packaged as ZIP", format: "audio-stems", quality: "high", resolution: "source", builtIn: true},
] as const;

export const normalizeExportPreset = (value: Partial<ExportPreset>): ExportPreset => {
  const format = ["mp4", "webm", "hevc", "prores", "png-sequence", "jpeg-sequence", "wav", "audio-stems"].includes(value.format ?? "") ? value.format! : "mp4";
  const quality = ["draft", "standard", "high"].includes(value.quality ?? "") ? value.quality! : "standard";
  return {
    id: String(value.id || `preset-${Date.now()}`).slice(0, 80),
    name: String(value.name || "Custom preset").slice(0, 80),
    description: String(value.description || "Custom encoding preset").slice(0, 160),
    format,
    quality,
    resolution: value.resolution === "720p" ? "720p" : "source",
    builtIn: false,
  };
};
