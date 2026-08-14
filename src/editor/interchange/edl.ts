import type {EditorProject} from "../types";
import {collectWarnings, reelName, safeExportName} from "./shared";
import {framesToTimecode} from "./timecode";
import type {InterchangeExport, InterchangeOptions} from "./types";

export const exportCmx3600Edl = (project: EditorProject, options: InterchangeOptions = {}): InterchangeExport => {
  const warnings = collectWarnings(project);
  const eligible = project.clips
    .filter((clip) => clip.kind === "video" || clip.kind === "image" || clip.kind === "audio")
    .sort((left, right) => left.start - right.start || left.trackId.localeCompare(right.trackId));
  const tc = (frame: number) => framesToTimecode(frame, project.fps, options.dropFrame);
  const lines = [`TITLE: ${project.name.toUpperCase()}`, `FCM: ${options.dropFrame ? "DROP FRAME" : "NON-DROP FRAME"}`, ""];

  eligible.forEach((clip, index) => {
    const media = project.media.find((item) => item.id === clip.sourceMediaId || item.src === clip.src);
    const sourceDuration = Math.max(1, Math.round(clip.duration * (clip.playbackRate ?? 1)));
    const track = clip.kind === "audio" ? "A" : "V";
    lines.push(`${String(index + 1).padStart(3, "0")}  ${reelName(media, clip.name).padEnd(8, " ")} ${track.padEnd(4, " ")} C        ${tc(clip.sourceStart)} ${tc(clip.sourceStart + sourceDuration)} ${tc(clip.start)} ${tc(clip.start + clip.duration)}`);
    lines.push(`* FROM CLIP NAME: ${clip.name}`);
    if (media?.fileName) lines.push(`* SOURCE FILE: ${media.fileName}`);
    lines.push("");
  });

  if (warnings.length) {
    lines.push("* DIRECTORS CUT PRO INTERCHANGE WARNINGS:");
    warnings.forEach((warning) => lines.push(`* ${warning.code.toUpperCase()}: ${warning.message}`));
  }

  return {content: `${lines.join("\n")}\n`, warnings, filename: `${safeExportName(project.name)}.edl`, mimeType: "text/plain"};
};
