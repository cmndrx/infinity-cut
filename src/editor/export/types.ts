export type ExportFormat = "mp4" | "webm" | "hevc" | "prores" | "png-sequence" | "jpeg-sequence" | "wav" | "audio-stems";
export type ExportQuality = "draft" | "standard" | "high";
export type ExportResolution = "source" | "720p";

export type ExportPreset = {
  id: string;
  name: string;
  description: string;
  format: ExportFormat;
  quality: ExportQuality;
  resolution: ExportResolution;
  builtIn?: boolean;
};

export type ExportStage = "queued" | "bundling" | "rendering" | "packaging" | "complete" | "cancelled" | "error";

export type ExportJob = {
  id: string;
  stage: ExportStage;
  progress: number;
  message: string;
  filename: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  sizeBytes?: number;
  error?: string;
  downloadUrl?: string;
};

export type ExportCapability = {
  id: string;
  available: boolean;
  label: string;
  reason?: string;
};

export type ExportCapabilities = {
  queue: {persistent: boolean; concurrency: number};
  formats: ExportCapability[];
  interchange: ExportCapability[];
  audio: ExportCapability[];
};
