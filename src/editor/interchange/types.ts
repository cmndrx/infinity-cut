export type InterchangeWarningCode =
  | "generated-media-omitted"
  | "nested-sequence-omitted"
  | "effect-not-translated"
  | "transition-not-translated"
  | "retime-requires-conform"
  | "still-image-requires-relink"
  | "missing-source-media";

export type InterchangeWarning = {
  code: InterchangeWarningCode;
  message: string;
  clipId?: string;
  sequenceId?: string;
};

export type InterchangeExport = {
  content: string;
  warnings: InterchangeWarning[];
  filename: string;
  mimeType: string;
};

export type InterchangeOptions = {
  dropFrame?: boolean;
  resolveMediaUrl?: (source: string) => string;
};
