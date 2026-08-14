import type {EditorClip, EditorProject} from "../types";
import {collectWarnings, safeExportName, xmlEscape} from "./shared";
import {nominalTimebase} from "./timecode";
import type {InterchangeExport, InterchangeOptions} from "./types";

const isNtsc = (fps: number) => [23.976, 29.97, 59.94].some((candidate) => Math.abs(candidate - fps) < 0.02);

const rateXml = (fps: number) => `<rate><timebase>${nominalTimebase(fps)}</timebase><ntsc>${isNtsc(fps) ? "TRUE" : "FALSE"}</ntsc></rate>`;

const clipXml = (project: EditorProject, clip: EditorClip, options: InterchangeOptions) => {
  const media = project.media.find((item) => item.id === clip.sourceMediaId || item.src === clip.src);
  const source = media?.src ?? clip.src ?? "";
  const resolved = options.resolveMediaUrl ? options.resolveMediaUrl(source) : source;
  const sourceDuration = Math.max(clip.sourceStart + Math.round(clip.duration * (clip.playbackRate ?? 1)), media?.duration ?? 0, 1);
  const mediaType = clip.kind === "audio" ? "audio" : "video";
  return [
    `<clipitem id="clip-${xmlEscape(clip.id)}">`,
    `<name>${xmlEscape(clip.name)}</name>`,
    `<duration>${sourceDuration}</duration>${rateXml(project.fps)}`,
    `<start>${clip.start}</start><end>${clip.start + clip.duration}</end><in>${clip.sourceStart}</in><out>${clip.sourceStart + Math.round(clip.duration * (clip.playbackRate ?? 1))}</out>`,
    `<file id="file-${xmlEscape(media?.id ?? clip.id)}"><name>${xmlEscape(media?.fileName ?? media?.name ?? clip.name)}</name><pathurl>${xmlEscape(resolved)}</pathurl><duration>${sourceDuration}</duration>${rateXml(project.fps)}</file>`,
    `<sourcetrack><mediatype>${mediaType}</mediatype><trackindex>1</trackindex></sourcetrack>`,
    "</clipitem>",
  ].join("");
};

export const exportFcp7Xml = (project: EditorProject, options: InterchangeOptions = {}): InterchangeExport => {
  const warnings = collectWarnings(project);
  const trackXml = (kind: "video" | "audio") => project.tracks
    .filter((track) => track.kind === kind)
    .map((track) => `<track>${project.clips.filter((clip) => clip.trackId === track.id && (kind === "audio" ? clip.kind === "audio" : clip.kind === "video" || clip.kind === "image")).sort((a, b) => a.start - b.start).map((clip) => clipXml(project, clip, options)).join("")}</track>`)
    .join("");
  const warningXml = warnings.map((warning) => `<!-- ${xmlEscape(`${warning.code}: ${warning.message}`)} -->`).join("");
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5"><sequence id="sequence-${xmlEscape(project.activeSequenceId)}"><name>${xmlEscape(project.name)}</name><duration>${project.durationInFrames}</duration>${rateXml(project.fps)}<media><video><format><samplecharacteristics>${rateXml(project.fps)}<width>${project.width}</width><height>${project.height}</height></samplecharacteristics></format>${trackXml("video")}</video><audio>${trackXml("audio")}</audio></media>${warningXml}</sequence></xmeml>\n`;
  return {content, warnings, filename: `${safeExportName(project.name)}.xml`, mimeType: "application/xml"};
};
