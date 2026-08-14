import type {EditorClip, EditorProject, EditorTrack, EditorTransition, Effects, KeyframeProperty, MediaKind, Transform, TransitionType} from "../types";

export const MIN_CLIP_DURATION = 2;
export const MIN_PLAYBACK_RATE = 0.1;
export const MAX_PLAYBACK_RATE = 10;

export type TimelineIssueCode =
  | "INVALID_PROJECT_STRUCTURE"
  | "INVALID_PROJECT_SETTING"
  | "DUPLICATE_TRACK_ID"
  | "DUPLICATE_CLIP_ID"
  | "DUPLICATE_TRANSITION_ID"
  | "INVALID_TRACK"
  | "INVALID_CLIP_KIND"
  | "MISSING_TRACK"
  | "INCOMPATIBLE_TRACK"
  | "INVALID_CLIP_RANGE"
  | "INVALID_CLIP_STATE"
  | "INVALID_KEYFRAME"
  | "INVALID_MARKER"
  | "INVALID_MEDIA"
  | "INVALID_MEDIA_REFERENCE"
  | "TRACK_OVERLAP"
  | "INVALID_PLAYBACK_RATE"
  | "INVALID_TRANSITION";

export type TimelineIssue = {
  code: TimelineIssueCode;
  message: string;
  entityId?: string;
  path?: string;
};

export type ProjectValidation = {
  valid: boolean;
  issues: TimelineIssue[];
};

const visualKinds: ReadonlySet<MediaKind> = new Set(["video", "image", "title", "sequence"]);
const clipKinds: ReadonlySet<MediaKind> = new Set(["video", "image", "audio", "title", "caption", "sequence"]);
const trackKinds = new Set(["video", "audio", "caption"]);
const transitionTypes: ReadonlySet<TransitionType> = new Set(["cross-dissolve", "dip-to-black", "wipe-left", "slide-left"]);
const keyframeProperties: ReadonlySet<KeyframeProperty> = new Set([
  "transform.x", "transform.y", "transform.scale", "transform.rotation", "transform.opacity",
  "effects.brightness", "effects.contrast", "effects.saturation", "effects.blur", "effects.temperature",
  "effects.tint", "effects.exposure", "effects.highlights", "effects.shadows", "effects.whites", "effects.blacks",
  "effects.vibrance", "effects.hue", "effects.fade", "effects.sharpen", "effects.vignette", "effects.grain", "effects.glow",
  "audio.volume",
]);
const transformKeys: Array<keyof Transform> = ["x", "y", "scale", "rotation", "opacity"];
const numericEffectKeys: Array<keyof Effects> = [
  "brightness", "contrast", "saturation", "blur", "temperature", "tint", "exposure", "highlights", "shadows", "whites",
  "blacks", "vibrance", "hue", "fade", "sharpen", "vignette", "grain", "glow", "maskX", "maskY", "maskSize", "maskFeather",
];
const booleanEffectKeys: Array<keyof Effects> = [
  "enabled", "colorEnabled", "blurEnabled", "vignetteEnabled", "grainEnabled", "glowEnabled", "maskEnabled", "maskInverted",
];

export const isClipCompatibleWithTrack = (clip: Pick<EditorClip, "kind">, track: Pick<EditorTrack, "kind">) => {
  if (track.kind === "video") return visualKinds.has(clip.kind);
  if (track.kind === "audio") return clip.kind === "audio";
  if (track.kind === "caption") return clip.kind === "caption";
  return false;
};

export const isVisualClip = (clip: Pick<EditorClip, "kind">) => visualKinds.has(clip.kind);

export const isTransitionValid = (project: EditorProject, transition: EditorTransition) => {
  if (!transitionTypes.has(transition.type)) return false;
  const from = project.clips.find((clip) => clip.id === transition.fromClipId);
  const to = project.clips.find((clip) => clip.id === transition.toClipId);
  if (!from || !to || from.id === to.id || !isVisualClip(from) || !isVisualClip(to)) return false;
  if (from.trackId !== to.trackId || from.start + from.duration !== to.start) return false;
  return Number.isInteger(transition.duration)
    && transition.duration >= MIN_CLIP_DURATION
    && transition.duration <= Math.min(from.duration, to.duration);
};

const duplicateIds = (ids: string[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return duplicates;
};

const isEntityId = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export const validateProjectInvariants = (project: EditorProject): ProjectValidation => {
  const issues: TimelineIssue[] = [];
  const collections: Array<[keyof EditorProject, unknown]> = [
    ["tracks", project?.tracks],
    ["clips", project?.clips],
    ["markers", project?.markers],
    ["transitions", project?.transitions],
    ["mediaBins", project?.mediaBins],
    ["media", project?.media],
  ];
  for (const [path, value] of collections) {
    if (!Array.isArray(value)) issues.push({code: "INVALID_PROJECT_STRUCTURE", message: `${path} must be an array`, path});
  }
  if (issues.length) return {valid: false, issues};
  for (const [path, value] of collections) {
    if ((value as unknown[]).some((item) => typeof item !== "object" || item === null)) {
      issues.push({code: "INVALID_PROJECT_STRUCTURE", message: `${path} contains an invalid item`, path});
    }
  }
  if (issues.length) return {valid: false, issues};

  const settingChecks: Array<[string, number]> = [
    ["width", project.width],
    ["height", project.height],
    ["fps", project.fps],
    ["durationInFrames", project.durationInFrames],
  ];
  for (const [path, value] of settingChecks) {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({code: "INVALID_PROJECT_SETTING", message: `${path} must be a positive finite number`, path});
    }
  }

  for (const id of duplicateIds(project.tracks.map((track) => track.id))) {
    issues.push({code: "DUPLICATE_TRACK_ID", message: `Track id ${id} is duplicated`, entityId: id, path: "tracks"});
  }
  for (const id of duplicateIds(project.clips.map((clip) => clip.id))) {
    issues.push({code: "DUPLICATE_CLIP_ID", message: `Clip id ${id} is duplicated`, entityId: id, path: "clips"});
  }
  for (const id of duplicateIds(project.transitions.map((transition) => transition.id))) {
    issues.push({code: "DUPLICATE_TRANSITION_ID", message: `Transition id ${id} is duplicated`, entityId: id, path: "transitions"});
  }
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  const binIds = new Set<string>();
  for (const bin of project.mediaBins) {
    if (!isEntityId(bin.id) || binIds.has(bin.id)) {
      issues.push({code: "INVALID_MEDIA", message: `Media bin ${String(bin.id)} has an invalid or duplicate id`, entityId: String(bin.id), path: "mediaBins"});
    }
    if (isEntityId(bin.id)) binIds.add(bin.id);
  }
  const mediaIds = new Set<string>();
  for (const item of project.media) {
    if (!isEntityId(item.id) || mediaIds.has(item.id)) {
      issues.push({code: "INVALID_MEDIA", message: `Media ${String(item.id)} has an invalid or duplicate id`, entityId: String(item.id), path: "media"});
    }
    if (!isEntityId(item.binId) || !binIds.has(item.binId)) {
      issues.push({code: "INVALID_MEDIA_REFERENCE", message: `Media ${String(item.id)} references a missing bin`, entityId: String(item.id), path: "media.binId"});
    }
    if (isEntityId(item.id)) mediaIds.add(item.id);
  }
  for (const track of project.tracks) {
    if (!isEntityId(track.id) || !trackKinds.has(track.kind) || !Number.isFinite(track.volume)
      || [track.muted, track.solo, track.hidden, track.locked].some((value) => typeof value !== "boolean")) {
      issues.push({code: "INVALID_TRACK", message: `Track ${track.id || "(missing id)"} has invalid state`, entityId: track.id, path: "tracks"});
    }
  }
  for (const clip of project.clips) {
    const track = tracks.get(clip.trackId);
    if (!track) {
      issues.push({code: "MISSING_TRACK", message: `Clip ${clip.id} references missing track ${clip.trackId}`, entityId: clip.id, path: "clips.trackId"});
    } else if (!isClipCompatibleWithTrack(clip, track)) {
      issues.push({code: "INCOMPATIBLE_TRACK", message: `${clip.kind} clip ${clip.id} is incompatible with ${track.kind} track ${track.id}`, entityId: clip.id, path: "clips.trackId"});
    }
    if (!isEntityId(clip.id) || !isEntityId(clip.trackId) || !clipKinds.has(clip.kind)
      || (clip.linkedGroupId !== undefined && !isEntityId(clip.linkedGroupId))) {
      issues.push({code: "INVALID_CLIP_KIND", message: `Clip ${clip.id || "(missing id)"} has an invalid kind`, entityId: clip.id, path: "clips.kind"});
    }
    if (clip.sourceMediaId !== undefined && (!isEntityId(clip.sourceMediaId) || !mediaIds.has(clip.sourceMediaId))) {
      issues.push({code: "INVALID_MEDIA_REFERENCE", message: `Clip ${String(clip.id)} references missing source media`, entityId: String(clip.id), path: "clips.sourceMediaId"});
    }
    if (clip.kind === "sequence" && (!isEntityId(clip.nestedSequenceId) || !project.sequences?.some((sequence) => sequence.id === clip.nestedSequenceId))) {
      issues.push({code: "INVALID_MEDIA_REFERENCE", message: `Clip ${String(clip.id)} references a missing sequence`, entityId: String(clip.id), path: "clips.nestedSequenceId"});
    }
    if (!Number.isInteger(clip.start) || clip.start < 0 || !Number.isFinite(clip.sourceStart) || clip.sourceStart < 0
      || !Number.isInteger(clip.duration) || clip.duration < MIN_CLIP_DURATION || clip.start + clip.duration > project.durationInFrames) {
      issues.push({code: "INVALID_CLIP_RANGE", message: `Clip ${clip.id} has an invalid timeline or source range`, entityId: clip.id, path: "clips"});
    }
    const invalidTransform = !clip.transform || transformKeys.some((key) => !Number.isFinite(clip.transform[key]));
    const invalidEffects = !clip.effects || numericEffectKeys.some((key) => !Number.isFinite(clip.effects[key]))
      || booleanEffectKeys.some((key) => typeof clip.effects[key] !== "boolean");
    if (invalidTransform || invalidEffects
      || !Number.isFinite(clip.volume)
      || typeof clip.audioMuted !== "boolean"
      || (clip.preservePitch !== undefined && typeof clip.preservePitch !== "boolean")
      || !Number.isInteger(clip.fadeIn) || clip.fadeIn < 0
      || !Number.isInteger(clip.fadeOut) || clip.fadeOut < 0
      || clip.fadeIn + clip.fadeOut > clip.duration) {
      issues.push({code: "INVALID_CLIP_STATE", message: `Clip ${clip.id} has invalid transform, effect, audio, or fade state`, entityId: clip.id, path: "clips"});
    }
    if (!Array.isArray(clip.keyframes)) {
      issues.push({code: "INVALID_KEYFRAME", message: `Clip ${clip.id} keyframes must be an array`, entityId: clip.id, path: "clips.keyframes"});
    } else {
      const keyframeIds = new Set<string>();
      const keyframePositions = new Set<string>();
      for (const keyframe of clip.keyframes) {
        if (typeof keyframe !== "object" || keyframe === null) {
          issues.push({code: "INVALID_KEYFRAME", message: `Clip ${clip.id} contains an invalid keyframe entry`, entityId: clip.id, path: "clips.keyframes"});
          continue;
        }
        const position = `${keyframe.property}:${keyframe.frame}`;
        if (!isEntityId(keyframe.id) || keyframeIds.has(keyframe.id) || !Number.isInteger(keyframe.frame) || keyframe.frame < 0
          || keyframe.frame >= clip.duration || !Number.isFinite(keyframe.value)
          || !keyframeProperties.has(keyframe.property) || keyframePositions.has(position)
          || (keyframe.easing !== "linear" && keyframe.easing !== "ease-in-out")) {
          issues.push({code: "INVALID_KEYFRAME", message: `Clip ${clip.id} has an invalid keyframe`, entityId: keyframe.id || clip.id, path: "clips.keyframes"});
        }
        keyframeIds.add(keyframe.id);
        keyframePositions.add(position);
      }
    }
    const playbackRate = clip.playbackRate ?? 1;
    if (!Number.isFinite(playbackRate) || playbackRate < MIN_PLAYBACK_RATE || playbackRate > MAX_PLAYBACK_RATE) {
      issues.push({code: "INVALID_PLAYBACK_RATE", message: `Clip ${clip.id} has an invalid playback rate`, entityId: clip.id, path: "clips.playbackRate"});
    }
  }

  const markerIds = new Set<string>();
  for (const marker of project.markers) {
    if (!isEntityId(marker.id) || markerIds.has(marker.id) || !Number.isInteger(marker.frame) || marker.frame < 0 || marker.frame >= project.durationInFrames) {
      issues.push({code: "INVALID_MARKER", message: `Marker ${marker.id || "(missing id)"} has an invalid frame or id`, entityId: marker.id, path: "markers"});
    }
    markerIds.add(marker.id);
  }

  const transitionEdits = new Set<string>();
  for (const transition of project.transitions) {
    const edit = JSON.stringify([transition.fromClipId, transition.toClipId]);
    if (!isEntityId(transition.id) || !isEntityId(transition.fromClipId) || !isEntityId(transition.toClipId) || !isTransitionValid(project, transition)) {
      issues.push({code: "INVALID_TRANSITION", message: `Transition ${transition.id} does not join adjacent visual clips`, entityId: transition.id, path: "transitions"});
    } else if (transitionEdits.has(edit)) {
      issues.push({code: "INVALID_TRANSITION", message: `Transition ${transition.id} duplicates an existing edit transition`, entityId: transition.id, path: "transitions"});
    }
    transitionEdits.add(edit);
  }
  return {valid: issues.length === 0, issues};
};

export type PrunedTransitions = {
  project: EditorProject;
  prunedTransitionIds: string[];
};

export const pruneInvalidTransitions = (project: EditorProject): PrunedTransitions => {
  const prunedTransitionIds = project.transitions.filter((transition) => !isTransitionValid(project, transition)).map((transition) => transition.id);
  if (!prunedTransitionIds.length) return {project, prunedTransitionIds};
  const invalid = new Set(prunedTransitionIds);
  return {project: {...project, transitions: project.transitions.filter((transition) => !invalid.has(transition.id))}, prunedTransitionIds};
};
