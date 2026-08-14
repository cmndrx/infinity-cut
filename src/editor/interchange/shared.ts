import {DEFAULT_EFFECTS, DEFAULT_TRANSFORM, type EditorClip, type EditorProject, type ProjectMedia} from "../types";
import type {InterchangeWarning} from "./types";

export const safeExportName = (value: string) => value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "directors-cut";

export const xmlEscape = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

export const reelName = (media: ProjectMedia | undefined, fallback: string) => {
  const raw = media?.fileName ?? media?.name ?? fallback;
  const compact = raw.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (compact || "AX").slice(0, 8);
};

const differs = (value: Record<string, unknown>, defaults: Record<string, unknown>) => Object.entries(defaults).some(([key, expected]) => value[key] !== expected);

export const clipTranslationWarnings = (project: EditorProject, clip: EditorClip): InterchangeWarning[] => {
  const warnings: InterchangeWarning[] = [];
  if (clip.kind === "title" || clip.kind === "caption") warnings.push({code: "generated-media-omitted", clipId: clip.id, sequenceId: project.activeSequenceId, message: `${clip.name}: generated text is not represented by this interchange format.`});
  if (clip.kind === "sequence") warnings.push({code: "nested-sequence-omitted", clipId: clip.id, sequenceId: project.activeSequenceId, message: `${clip.name}: nested sequences must be flattened before interchange.`});
  if (Math.abs((clip.playbackRate ?? 1) - 1) > 0.001) warnings.push({code: "retime-requires-conform", clipId: clip.id, sequenceId: project.activeSequenceId, message: `${clip.name}: ${Math.round((clip.playbackRate ?? 1) * 1000) / 10}% speed requires manual conform.`});
  if (differs(clip.transform as unknown as Record<string, unknown>, DEFAULT_TRANSFORM as unknown as Record<string, unknown>) || differs(clip.effects as unknown as Record<string, unknown>, DEFAULT_EFFECTS as unknown as Record<string, unknown>) || clip.keyframes.length) {
    warnings.push({code: "effect-not-translated", clipId: clip.id, sequenceId: project.activeSequenceId, message: `${clip.name}: transforms, effects, masks, or keyframes are not translated.`});
  }
  if (clip.kind === "image") warnings.push({code: "still-image-requires-relink", clipId: clip.id, sequenceId: project.activeSequenceId, message: `${clip.name}: confirm still-image duration and relink after import.`});
  if (clip.kind !== "title" && clip.kind !== "caption" && clip.kind !== "sequence" && !project.media.find((item) => item.id === clip.sourceMediaId || item.src === clip.src)) {
    warnings.push({code: "missing-source-media", clipId: clip.id, sequenceId: project.activeSequenceId, message: `${clip.name}: source media metadata is missing and may require relinking.`});
  }
  return warnings;
};

export const collectWarnings = (project: EditorProject) => {
  const warnings = project.clips.flatMap((clip) => clipTranslationWarnings(project, clip));
  for (const transition of project.transitions) warnings.push({code: "transition-not-translated" as const, sequenceId: project.activeSequenceId, message: `${transition.type}: transition ${transition.id} is exported as a cut.`});
  return warnings;
};
