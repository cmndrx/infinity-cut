import type {ClipKeyframe, EditorClip, EditorProject} from "../types";
import {DEFAULT_EFFECTS, DEFAULT_TRANSFORM} from "../types";
import {
  MAX_PLAYBACK_RATE,
  MIN_CLIP_DURATION,
  MIN_PLAYBACK_RATE,
  isClipCompatibleWithTrack,
  pruneInvalidTransitions,
  type TimelineIssue,
  validateProjectInvariants,
} from "./invariants";

export type SplitClipCommand = {type: "split-clip"; clipId: string; frame: number; includeLinked?: boolean};
export type RippleDeleteCommand = {type: "ripple-delete"; clipIds: string[]; includeLinked?: boolean};
export type RetimeClipCommand = {
  type: "retime-clip";
  clipId: string;
  playbackRate: number;
  ripple?: boolean;
  preservePitch?: boolean;
  includeLinked?: boolean;
};
export type MoveClipsCommand = {
  type: "move-clips";
  clipIds: string[];
  deltaFrames: number;
  trackAssignments?: Record<string, string>;
  includeLinked?: boolean;
};
export type TrimClipCommand = {
  type: "trim-clip";
  clipId: string;
  edge: "start" | "end";
  deltaFrames: number;
  ripple?: boolean;
  includeLinked?: boolean;
};
export type CloneClipsCommand = {
  type: "clone-clips";
  clips: EditorClip[];
  transitions?: EditorProject["transitions"];
  atFrame: number;
  trackMap?: Record<string, string>;
  idBase: string;
};
export type PlaceMediaCommand = {
  type: "place-media";
  mode: "insert" | "overwrite";
  atFrame: number;
  items: Array<{
    mediaId: string;
    trackId: string;
    offsetFrames?: number;
    duration?: number;
    sourceStart?: number;
    linkedKey?: string;
  }>;
  rippleTrackIds?: string[];
  idBase: string;
};
export type RestoreProjectCommand = {type: "restore-project"; project: EditorProject};
export type TimelineCommand = SplitClipCommand | RippleDeleteCommand | RetimeClipCommand | MoveClipsCommand | TrimClipCommand | CloneClipsCommand | PlaceMediaCommand | RestoreProjectCommand;

export type CommandErrorCode =
  | "INVALID_PROJECT"
  | "CLIP_NOT_FOUND"
  | "TRACK_LOCKED"
  | "INVALID_SPLIT_POINT"
  | "INVALID_PLAYBACK_RATE"
  | "INVALID_FRAME"
  | "INVALID_DURATION"
  | "TRACK_NOT_FOUND"
  | "INCOMPATIBLE_TRACK"
  | "INVALID_TRACK_TARGET"
  | "INVALID_SOURCE_RANGE"
  | "PLACEMENT_CONFLICT"
  | "INVALID_COMMAND"
  | "EMPTY_SELECTION"
  | "LINKED_OPERATION_CONFLICT"
  | "INVALID_RESTORE";

export type CommandError = {
  code: CommandErrorCode;
  message: string;
  entityId?: string;
  issues?: TimelineIssue[];
};

export type CommandSuccess = {
  ok: true;
  changed: boolean;
  project: EditorProject;
  inverse: RestoreProjectCommand;
  affectedClipIds: string[];
  createdClipIds: string[];
  removedClipIds: string[];
  prunedTransitionIds: string[];
};

export type CommandFailure = {
  ok: false;
  project: EditorProject;
  error: CommandError;
};

export type CommandResult = CommandSuccess | CommandFailure;

const cloneProject = (project: EditorProject): EditorProject => structuredClone(project);
const trustedRestores = new WeakMap<RestoreProjectCommand, {project: EditorProject; expectedInput: string}>();
const projectFingerprint = (project: EditorProject) => JSON.stringify(project);

const failure = (project: EditorProject, error: CommandError): CommandFailure => ({ok: false, project: cloneProject(project), error});

const uniqueId = (base: string, used: Set<string>) => {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  used.add(candidate);
  return candidate;
};

const linkedClosure = (project: EditorProject, seedIds: string[]) => {
  const ids = new Set(seedIds);
  const groups = new Set(project.clips.filter((clip) => ids.has(clip.id) && clip.linkedGroupId).map((clip) => clip.linkedGroupId));
  for (const clip of project.clips) if (clip.linkedGroupId && groups.has(clip.linkedGroupId)) ids.add(clip.id);
  return ids;
};

const lockedClip = (project: EditorProject, ids: Set<string>) => {
  const tracksById = new Map(project.tracks.map((track) => [track.id, track]));
  return project.clips.find((clip) => ids.has(clip.id) && tracksById.get(clip.trackId)?.locked);
};

const recalculateDuration = (project: EditorProject) => ({
  ...project,
  durationInFrames: Math.max(project.durationInFrames, 1, ...project.clips.map((clip) => clip.start + clip.duration)),
});

type OverlapSegment = {start: number; end: number; depth: number};

const trackOverlapProfiles = (project: EditorProject) => {
  const profiles = new Map<string, OverlapSegment[]>();
  const clipsByTrack = new Map<string, EditorClip[]>();
  for (const clip of project.clips) {
    const trackClips = clipsByTrack.get(clip.trackId);
    if (trackClips) trackClips.push(clip);
    else clipsByTrack.set(clip.trackId, [clip]);
  }
  for (const track of project.tracks) {
    const events = (clipsByTrack.get(track.id) ?? [])
      .flatMap((clip) => [{frame: clip.start, delta: 1}, {frame: clip.start + clip.duration, delta: -1}])
      .sort((a, b) => a.frame - b.frame);
    const segments: OverlapSegment[] = [];
    let active = 0;
    let previousFrame = events[0]?.frame ?? 0;
    for (let index = 0; index < events.length;) {
      const frame = events[index].frame;
      if (frame > previousFrame && active >= 2) segments.push({start: previousFrame, end: frame, depth: active});
      let delta = 0;
      while (index < events.length && events[index].frame === frame) delta += events[index++].delta;
      active += delta;
      previousFrame = frame;
    }
    if (segments.length) profiles.set(track.id, segments);
  }
  return profiles;
};

const worsensTrackOverlaps = (before: EditorProject, after: EditorProject) => {
  const previous = trackOverlapProfiles(before);
  for (const [trackId, afterSegments] of trackOverlapProfiles(after)) {
    const beforeSegments = previous.get(trackId) ?? [];
    let beforeIndex = 0;
    for (const afterSegment of afterSegments) {
      let cursor = afterSegment.start;
      while (cursor < afterSegment.end) {
        while (beforeIndex < beforeSegments.length && beforeSegments[beforeIndex].end <= cursor) beforeIndex++;
        const beforeSegment = beforeSegments[beforeIndex];
        if (!beforeSegment || beforeSegment.start > cursor || beforeSegment.depth < afterSegment.depth) {
          return {trackId, frame: cursor, depth: afterSegment.depth};
        }
        cursor = Math.min(afterSegment.end, beforeSegment.end);
      }
    }
  }
  return null;
};

type ShiftResult = {ok: true; shifts: Map<string, number>} | {ok: false; clipId: string; reason: "conflict" | "locked" | "negative"};

/** Propagates a requested timeline shift through linked groups without guessing between conflicting deltas. */
const synchronizeShifts = (project: EditorProject, baseShifts: Map<string, number>, excluded: Set<string>): ShiftResult => {
  const shifts = new Map(baseShifts);
  const clipsById = new Map(project.clips.map((clip) => [clip.id, clip]));
  const tracksById = new Map(project.tracks.map((track) => [track.id, track]));
  const groups = new Map<string, EditorClip[]>();
  for (const clip of project.clips) {
    if (!clip.linkedGroupId || excluded.has(clip.id)) continue;
    const group = groups.get(clip.linkedGroupId);
    if (group) group.push(clip);
    else groups.set(clip.linkedGroupId, [clip]);
  }
  for (const clips of groups.values()) {
    const requested = new Set(clips.flatMap((clip) => shifts.has(clip.id) ? [shifts.get(clip.id) as number] : []));
    if (requested.size > 1) return {ok: false, clipId: clips[0].id, reason: "conflict"};
    if (!requested.size) continue;
    const delta = [...requested][0];
    for (const clip of clips) shifts.set(clip.id, delta);
  }
  for (const [clipId, delta] of shifts) {
    const clip = clipsById.get(clipId);
    if (!clip) continue;
    if (clip.start + delta < 0) return {ok: false, clipId, reason: "negative"};
    if (tracksById.get(clip.trackId)?.locked) return {ok: false, clipId, reason: "locked"};
  }
  return {ok: true, shifts};
};

const finish = (
  before: EditorProject,
  changed: EditorProject,
  details: Pick<CommandSuccess, "affectedClipIds" | "createdClipIds" | "removedClipIds">,
  allowOverlapRestore = false,
): CommandResult => {
  const pruned = pruneInvalidTransitions(recalculateDuration(changed));
  const worsenedOverlap = allowOverlapRestore ? null : worsensTrackOverlaps(before, pruned.project);
  if (worsenedOverlap) return failure(before, {
    code: "INVALID_PROJECT",
    message: "Command would create overlapping clips on the same track",
    issues: [{code: "TRACK_OVERLAP", message: `Command worsened overlap on ${worsenedOverlap.trackId} at frame ${worsenedOverlap.frame}`, path: "clips"}],
  });
  const validation = validateProjectInvariants(pruned.project);
  if (!validation.valid) return failure(before, {code: "INVALID_PROJECT", message: "Command would violate timeline invariants", issues: validation.issues});
  const inverse: RestoreProjectCommand = {type: "restore-project", project: cloneProject(before)};
  trustedRestores.set(inverse, {project: cloneProject(before), expectedInput: projectFingerprint(pruned.project)});
  return {
    ok: true,
    changed: projectFingerprint(before) !== projectFingerprint(pruned.project),
    project: pruned.project,
    inverse,
    prunedTransitionIds: pruned.prunedTransitionIds,
    ...details,
  };
};

const prepare = (project: EditorProject): {ok: true; project: EditorProject} | CommandFailure => {
  const cloned = cloneProject(project);
  const validation = validateProjectInvariants(cloned);
  if (!validation.valid) return failure(project, {code: "INVALID_PROJECT", message: "Project violates timeline invariants", issues: validation.issues});
  return {ok: true, project: cloned};
};

const splitKeyframes = (keyframes: ClipKeyframe[], offset: number, usedIds: Set<string>) => ({
  left: keyframes.filter((keyframe) => keyframe.frame < offset).map((keyframe) => ({...keyframe})),
  right: keyframes.filter((keyframe) => keyframe.frame >= offset).map((keyframe) => ({
    ...keyframe,
    id: uniqueId(`${keyframe.id}-split`, usedIds),
    frame: keyframe.frame - offset,
  })),
});

const executeSplit = (project: EditorProject, command: SplitClipCommand): CommandResult => {
  const target = project.clips.find((clip) => clip.id === command.clipId);
  if (!target) return failure(project, {code: "CLIP_NOT_FOUND", message: `Clip ${command.clipId} was not found`, entityId: command.clipId});
  if (!Number.isInteger(command.frame)) return failure(project, {code: "INVALID_SPLIT_POINT", message: "Split frame must be a whole frame", entityId: target.id});
  const linkedIds = command.includeLinked === false ? new Set([target.id]) : linkedClosure(project, [target.id]);
  const ids = new Set(project.clips
    .filter((clip) => linkedIds.has(clip.id) && command.frame > clip.start && command.frame < clip.start + clip.duration)
    .map((clip) => clip.id));
  ids.add(target.id);
  const reassignedIds = new Set(project.clips
    .filter((clip) => linkedIds.has(clip.id) && !ids.has(clip.id) && clip.start >= command.frame)
    .map((clip) => clip.id));
  const mutationIds = new Set([...ids, ...reassignedIds]);
  const locked = lockedClip(project, mutationIds);
  if (locked) return failure(project, {code: "TRACK_LOCKED", message: `Track containing ${locked.id} is locked`, entityId: locked.id});
  const clips = project.clips.filter((clip) => ids.has(clip.id));
  const invalid = clips.find((clip) => command.frame - clip.start < MIN_CLIP_DURATION || clip.start + clip.duration - command.frame < MIN_CLIP_DURATION);
  if (invalid) {
    return failure(project, {
      code: "INVALID_SPLIT_POINT",
      message: `Frame ${command.frame} cannot split every linked clip into valid segments`,
      entityId: invalid.id,
    });
  }

  const usedClipIds = new Set(project.clips.map((clip) => clip.id));
  const usedLinkedGroupIds = new Set(project.clips.flatMap((clip) => clip.linkedGroupId ? [clip.linkedGroupId] : []));
  const rightGroupByOriginal = new Map<string, string>();
  if (command.includeLinked !== false) {
    for (const clip of clips) {
      if (clip.linkedGroupId && !rightGroupByOriginal.has(clip.linkedGroupId)) {
        rightGroupByOriginal.set(clip.linkedGroupId, uniqueId(`${clip.linkedGroupId}-split-${command.frame}`, usedLinkedGroupIds));
      }
    }
  }
  const usedKeyframeIds = new Set(project.clips.flatMap((clip) => clip.keyframes.map((keyframe) => keyframe.id)));
  const rightByOriginal = new Map<string, string>();
  const replacements = new Map<string, [EditorClip, EditorClip]>();
  for (const clip of clips) {
    const offset = command.frame - clip.start;
    const rightId = uniqueId(`${clip.id}-split-${command.frame}`, usedClipIds);
    const keyframes = splitKeyframes(clip.keyframes, offset, usedKeyframeIds);
    const left: EditorClip = {...clip, duration: offset, fadeIn: Math.min(clip.fadeIn, offset), fadeOut: 0, keyframes: keyframes.left};
    const rightDuration = clip.duration - offset;
    const right: EditorClip = {
      ...clip,
      id: rightId,
      name: `${clip.name} B`,
      linkedGroupId: clip.linkedGroupId && command.includeLinked !== false
        ? rightGroupByOriginal.get(clip.linkedGroupId)
        : undefined,
      start: command.frame,
      duration: rightDuration,
      sourceStart: clip.sourceStart + offset * (clip.playbackRate ?? 1),
      fadeIn: 0,
      fadeOut: Math.min(clip.fadeOut, rightDuration),
      keyframes: keyframes.right,
    };
    replacements.set(clip.id, [left, right]);
    rightByOriginal.set(clip.id, rightId);
  }
  const reassignedGroupByClipId = new Map<string, string>();
  if (command.includeLinked !== false) {
    for (const clip of project.clips) {
      if (!ids.has(clip.id) && linkedIds.has(clip.id) && clip.linkedGroupId && clip.start >= command.frame) {
        const rightGroupId = rightGroupByOriginal.get(clip.linkedGroupId);
        if (rightGroupId) reassignedGroupByClipId.set(clip.id, rightGroupId);
      }
    }
  }
  const changed: EditorProject = {
    ...project,
    clips: project.clips.flatMap((clip) => replacements.get(clip.id)
      ?? [{...clip, linkedGroupId: reassignedGroupByClipId.get(clip.id) ?? clip.linkedGroupId}]),
    transitions: project.transitions.map((transition) => ({
      ...transition,
      fromClipId: rightByOriginal.get(transition.fromClipId) ?? transition.fromClipId,
    })),
  };
  return finish(project, changed, {
    affectedClipIds: [...mutationIds],
    createdClipIds: [...rightByOriginal.values()],
    removedClipIds: [],
  });
};

const executeRippleDelete = (project: EditorProject, command: RippleDeleteCommand): CommandResult => {
  if (!command.clipIds.length) return failure(project, {code: "EMPTY_SELECTION", message: "Ripple delete requires at least one clip"});
  const existingClipIds = new Set(project.clips.map((clip) => clip.id));
  const missing = command.clipIds.find((id) => !existingClipIds.has(id));
  if (missing) return failure(project, {code: "CLIP_NOT_FOUND", message: `Clip ${missing} was not found`, entityId: missing});
  const ids = command.includeLinked === false ? new Set(command.clipIds) : linkedClosure(project, command.clipIds);
  const locked = lockedClip(project, ids);
  if (locked) return failure(project, {code: "TRACK_LOCKED", message: `Track containing ${locked.id} is locked`, entityId: locked.id});

  const ranges = new Map<string, Array<{start: number; end: number}>>();
  for (const clip of project.clips.filter((candidate) => ids.has(candidate.id))) {
    const trackRanges = ranges.get(clip.trackId);
    const range = {start: clip.start, end: clip.start + clip.duration};
    if (trackRanges) trackRanges.push(range);
    else ranges.set(clip.trackId, [range]);
  }
  for (const [trackId, trackRanges] of ranges) {
    const merged: Array<{start: number; end: number}> = [];
    for (const range of trackRanges.sort((a, b) => a.start - b.start || a.end - b.end)) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({...range});
    }
    ranges.set(trackId, merged);
  }
  const firstRangeEndingAfter = (trackRanges: Array<{start: number; end: number}>, frame: number) => {
    let low = 0;
    let high = trackRanges.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (trackRanges[middle].end <= frame) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const partialOverlap = project.clips.find((clip) => {
    if (ids.has(clip.id)) return false;
    const trackRanges = ranges.get(clip.trackId) ?? [];
    const range = trackRanges[firstRangeEndingAfter(trackRanges, clip.start)];
    return Boolean(range && range.start < clip.start + clip.duration);
  });
  if (partialOverlap) return failure(project, {
    code: "LINKED_OPERATION_CONFLICT",
    message: `Ripple delete cannot close a range partially overlapped by ${partialOverlap.name}`,
    entityId: partialOverlap.id,
  });
  const baseShifts = new Map<string, number>();
  const rangePrefixes = new Map<string, number[]>();
  for (const [trackId, trackRanges] of ranges) {
    const prefix = [0];
    for (const range of trackRanges) prefix.push(prefix[prefix.length - 1] + range.end - range.start);
    rangePrefixes.set(trackId, prefix);
  }
  for (const clip of project.clips) {
    if (ids.has(clip.id)) continue;
    const trackRanges = ranges.get(clip.trackId) ?? [];
    const removedBefore = (rangePrefixes.get(clip.trackId) ?? [0])[firstRangeEndingAfter(trackRanges, clip.start)];
    if (removedBefore) baseShifts.set(clip.id, -removedBefore);
  }
  const synchronized = synchronizeShifts(project, baseShifts, ids);
  if (!synchronized.ok) return failure(project, {
    code: synchronized.reason === "locked" ? "TRACK_LOCKED" : "LINKED_OPERATION_CONFLICT",
    message: synchronized.reason === "locked" ? "Ripple shift would move media on a locked track" : "Ripple shift would desynchronize linked media",
    entityId: synchronized.clipId,
  });

  const changed: EditorProject = {
    ...project,
    clips: project.clips.filter((clip) => !ids.has(clip.id)).map((clip) => ({...clip, start: clip.start + (synchronized.shifts.get(clip.id) ?? 0)})),
  };
  return finish(project, changed, {
    affectedClipIds: [...new Set([...ids, ...synchronized.shifts.keys()])],
    createdClipIds: [],
    removedClipIds: [...ids],
  });
};

const retime = (clip: EditorClip, rate: number, preservePitch: boolean) => {
  const oldRate = clip.playbackRate ?? 1;
  const oldPreservePitch = clip.preservePitch ?? true;
  if (oldRate === rate && oldPreservePitch === preservePitch) return {...clip};
  const duration = Math.max(MIN_CLIP_DURATION, Math.round((clip.duration * oldRate) / rate));
  const ratio = duration / clip.duration;
  const fadeIn = Math.min(duration, Math.round(clip.fadeIn * ratio));
  const fadeOut = Math.min(duration - fadeIn, Math.round(clip.fadeOut * ratio));
  const keyframesByPosition = new Map<string, ClipKeyframe>();
  for (const keyframe of clip.keyframes) {
    const changed = {...keyframe, frame: Math.round(keyframe.frame * ratio)};
    if (changed.frame < duration) keyframesByPosition.set(`${changed.property}:${changed.frame}`, changed);
  }
  return {
    ...clip,
    playbackRate: rate,
    preservePitch,
    duration,
    fadeIn,
    fadeOut,
    keyframes: [...keyframesByPosition.values()],
  };
};

const executeRetime = (project: EditorProject, command: RetimeClipCommand): CommandResult => {
  const target = project.clips.find((clip) => clip.id === command.clipId);
  if (!target) return failure(project, {code: "CLIP_NOT_FOUND", message: `Clip ${command.clipId} was not found`, entityId: command.clipId});
  if (!Number.isFinite(command.playbackRate) || command.playbackRate < MIN_PLAYBACK_RATE || command.playbackRate > MAX_PLAYBACK_RATE) {
    return failure(project, {code: "INVALID_PLAYBACK_RATE", message: `Playback rate must be between ${MIN_PLAYBACK_RATE} and ${MAX_PLAYBACK_RATE}`, entityId: target.id});
  }
  const ids = command.includeLinked === false ? new Set([target.id]) : linkedClosure(project, [target.id]);
  const locked = lockedClip(project, ids);
  if (locked) return failure(project, {code: "TRACK_LOCKED", message: `Track containing ${locked.id} is locked`, entityId: locked.id});

  const replacements = new Map<string, EditorClip>();
  for (const clip of project.clips.filter((candidate) => ids.has(candidate.id))) {
    replacements.set(clip.id, retime(clip, command.playbackRate, command.preservePitch ?? clip.preservePitch ?? true));
  }
  const baseShifts = new Map<string, number>();
  if (command.ripple) {
    const eventsByTrack = new Map<string, Array<{frame: number; delta: number}>>();
    for (const original of project.clips.filter((clip) => ids.has(clip.id))) {
      const changed = replacements.get(original.id) as EditorClip;
      const delta = changed.duration - original.duration;
      if (!delta) continue;
      const events = eventsByTrack.get(original.trackId);
      const event = {frame: original.start + original.duration, delta};
      if (events) events.push(event);
      else eventsByTrack.set(original.trackId, [event]);
    }
    const eventPrefixes = new Map<string, {events: Array<{frame: number; delta: number}>; prefix: number[]} >();
    for (const [trackId, events] of eventsByTrack) {
      events.sort((a, b) => a.frame - b.frame);
      const prefix = [0];
      for (const event of events) prefix.push(prefix[prefix.length - 1] + event.delta);
      eventPrefixes.set(trackId, {events, prefix});
    }
    for (const clip of project.clips) {
      if (ids.has(clip.id)) continue;
      const entry = eventPrefixes.get(clip.trackId);
      if (!entry) continue;
      let low = 0;
      let high = entry.events.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (entry.events[middle].frame <= clip.start) low = middle + 1;
        else high = middle;
      }
      const delta = entry.prefix[low];
      if (delta) baseShifts.set(clip.id, delta);
    }
  }
  const synchronized = synchronizeShifts(project, baseShifts, ids);
  if (!synchronized.ok) return failure(project, {
    code: synchronized.reason === "locked" ? "TRACK_LOCKED" : "LINKED_OPERATION_CONFLICT",
    message: synchronized.reason === "locked" ? "Speed ripple would move media on a locked track" : "Speed ripple would desynchronize linked media",
    entityId: synchronized.clipId,
  });
  const changed: EditorProject = {
    ...project,
    clips: project.clips.map((clip) => replacements.get(clip.id) ?? {...clip, start: clip.start + (synchronized.shifts.get(clip.id) ?? 0)}),
  };
  return finish(project, changed, {
    affectedClipIds: [...new Set([...ids, ...synchronized.shifts.keys()])],
    createdClipIds: [],
    removedClipIds: [],
  });
};

const executeMove = (project: EditorProject, command: MoveClipsCommand): CommandResult => {
  if (!command.clipIds.length) return failure(project, {code: "EMPTY_SELECTION", message: "Move requires at least one clip"});
  if (!Number.isInteger(command.deltaFrames)) return failure(project, {code: "INVALID_FRAME", message: "Move delta must be a whole frame"});
  const clipsById = new Map(project.clips.map((clip) => [clip.id, clip]));
  const missing = command.clipIds.find((id) => !clipsById.has(id));
  if (missing) return failure(project, {code: "CLIP_NOT_FOUND", message: `Clip ${missing} was not found`, entityId: missing});
  const ids = command.includeLinked === false ? new Set(command.clipIds) : linkedClosure(project, command.clipIds);
  const locked = lockedClip(project, ids);
  if (locked) return failure(project, {code: "TRACK_LOCKED", message: `Track containing ${locked.id} is locked`, entityId: locked.id});
  const tracksById = new Map(project.tracks.map((track) => [track.id, track]));
  const assignments = new Map<string, string>();
  for (const id of ids) {
    const clip = clipsById.get(id) as EditorClip;
    const trackId = command.trackAssignments?.[id] ?? clip.trackId;
    const track = tracksById.get(trackId);
    if (!track) return failure(project, {code: "TRACK_NOT_FOUND", message: `Track ${trackId} was not found`, entityId: trackId});
    if (track.locked) return failure(project, {code: "TRACK_LOCKED", message: `${track.name} is locked`, entityId: track.id});
    if (!isClipCompatibleWithTrack(clip, track)) return failure(project, {code: "INCOMPATIBLE_TRACK", message: `${clip.name} is incompatible with ${track.name}`, entityId: clip.id});
    if (clip.start + command.deltaFrames < 0) return failure(project, {code: "INVALID_FRAME", message: `${clip.name} cannot move before frame 0`, entityId: clip.id});
    assignments.set(id, trackId);
  }
  const isNoop = command.deltaFrames === 0 && [...ids].every((id) => assignments.get(id) === clipsById.get(id)?.trackId);
  if (isNoop) return finish(project, project, {affectedClipIds: [], createdClipIds: [], removedClipIds: []});
  const partiallyMovedGroups = new Set<string>();
  if (command.includeLinked === false) {
    const selectedByGroup = new Map<string, number>();
    const totalByGroup = new Map<string, number>();
    for (const clip of project.clips) {
      if (!clip.linkedGroupId) continue;
      totalByGroup.set(clip.linkedGroupId, (totalByGroup.get(clip.linkedGroupId) ?? 0) + 1);
      if (ids.has(clip.id)) selectedByGroup.set(clip.linkedGroupId, (selectedByGroup.get(clip.linkedGroupId) ?? 0) + 1);
    }
    for (const [groupId, count] of selectedByGroup) if (count < (totalByGroup.get(groupId) ?? 0)) partiallyMovedGroups.add(groupId);
  }
  const changed: EditorProject = {
    ...project,
    clips: project.clips.map((clip) => ids.has(clip.id) ? {
      ...clip,
      start: clip.start + command.deltaFrames,
      trackId: assignments.get(clip.id) as string,
      linkedGroupId: clip.linkedGroupId && partiallyMovedGroups.has(clip.linkedGroupId) ? undefined : clip.linkedGroupId,
    } : clip),
  };
  return finish(project, changed, {
    affectedClipIds: [...ids],
    createdClipIds: [],
    removedClipIds: [],
  });
};

const executeTrim = (project: EditorProject, command: TrimClipCommand): CommandResult => {
  const target = project.clips.find((clip) => clip.id === command.clipId);
  if (!target) return failure(project, {code: "CLIP_NOT_FOUND", message: `Clip ${command.clipId} was not found`, entityId: command.clipId});
  if (!Number.isInteger(command.deltaFrames)) return failure(project, {code: "INVALID_FRAME", message: "Trim delta must be a whole frame", entityId: target.id});
  if (command.deltaFrames === 0) return finish(project, project, {affectedClipIds: [], createdClipIds: [], removedClipIds: []});
  const ids = command.includeLinked === false ? new Set([target.id]) : linkedClosure(project, [target.id]);
  const locked = lockedClip(project, ids);
  if (locked) return failure(project, {code: "TRACK_LOCKED", message: `Track containing ${locked.id} is locked`, entityId: locked.id});
  const replacements = new Map<string, EditorClip>();
  const partialGroupIds = new Set<string>();
  if (command.includeLinked === false && target.linkedGroupId && project.clips.some((clip) => clip.linkedGroupId === target.linkedGroupId && clip.id !== target.id)) partialGroupIds.add(target.linkedGroupId);
  for (const clip of project.clips.filter((candidate) => ids.has(candidate.id))) {
    const duration = command.edge === "start" ? clip.duration - command.deltaFrames : clip.duration + command.deltaFrames;
    if (duration < MIN_CLIP_DURATION) return failure(project, {code: "INVALID_DURATION", message: `${clip.name} must remain at least ${MIN_CLIP_DURATION} frames`, entityId: clip.id});
    const sourceStart = command.edge === "start" ? clip.sourceStart + command.deltaFrames * (clip.playbackRate ?? 1) : clip.sourceStart;
    if (!Number.isFinite(sourceStart) || sourceStart < 0) return failure(project, {code: "INVALID_SOURCE_RANGE", message: `${clip.name} has no source media before this point`, entityId: clip.id});
    const keyframes = command.edge === "start"
      ? clip.keyframes.map((keyframe) => ({...keyframe, frame: keyframe.frame - command.deltaFrames})).filter((keyframe) => keyframe.frame >= 0 && keyframe.frame < duration)
      : clip.keyframes.filter((keyframe) => keyframe.frame < duration).map((keyframe) => ({...keyframe}));
    const fadeIn = Math.min(clip.fadeIn, duration);
    const fadeOut = Math.min(clip.fadeOut, duration - fadeIn);
    replacements.set(clip.id, {
      ...clip,
      linkedGroupId: clip.linkedGroupId && partialGroupIds.has(clip.linkedGroupId) ? undefined : clip.linkedGroupId,
      start: command.edge === "start" && !command.ripple ? clip.start + command.deltaFrames : clip.start,
      duration,
      sourceStart,
      fadeIn,
      fadeOut,
      keyframes,
    });
  }
  const baseShifts = new Map<string, number>();
  if (command.ripple && command.deltaFrames !== 0) {
    const eventsByTrack = new Map<string, Array<{frame: number; delta: number}>>();
    for (const clip of project.clips.filter((candidate) => ids.has(candidate.id))) {
      const events = eventsByTrack.get(clip.trackId);
      const event = {
        frame: clip.start + clip.duration,
        delta: command.edge === "start" ? -command.deltaFrames : command.deltaFrames,
      };
      if (events) events.push(event);
      else eventsByTrack.set(clip.trackId, [event]);
    }
    for (const clip of project.clips) {
      if (ids.has(clip.id)) continue;
      const delta = (eventsByTrack.get(clip.trackId) ?? []).filter((event) => event.frame <= clip.start).reduce((total, event) => total + event.delta, 0);
      if (delta) baseShifts.set(clip.id, delta);
    }
  }
  const synchronized = synchronizeShifts(project, baseShifts, ids);
  if (!synchronized.ok) return failure(project, {
    code: synchronized.reason === "locked" ? "TRACK_LOCKED" : "LINKED_OPERATION_CONFLICT",
    message: synchronized.reason === "locked" ? "Ripple trim would move media on a locked track" : "Ripple trim would desynchronize linked media",
    entityId: synchronized.clipId,
  });
  const changed: EditorProject = {
    ...project,
    clips: project.clips.map((clip) => replacements.get(clip.id) ?? {...clip, start: clip.start + (synchronized.shifts.get(clip.id) ?? 0)}),
  };
  return finish(project, changed, {
    affectedClipIds: command.deltaFrames === 0 ? [] : [...new Set([...ids, ...synchronized.shifts.keys()])],
    createdClipIds: [],
    removedClipIds: [],
  });
};

const executeClone = (project: EditorProject, command: CloneClipsCommand): CommandResult => {
  if (!command.clips.length) return failure(project, {code: "EMPTY_SELECTION", message: "Paste requires at least one clip"});
  if (!Number.isInteger(command.atFrame) || command.atFrame < 0) return failure(project, {code: "INVALID_FRAME", message: "Paste frame must be a nonnegative whole frame"});
  if (typeof command.idBase !== "string" || !command.idBase.trim()) return failure(project, {code: "INVALID_TRACK_TARGET", message: "Paste requires a deterministic id base"});
  const sourceIds = new Set(command.clips.map((clip) => clip.id));
  if (sourceIds.size !== command.clips.length) return failure(project, {code: "INVALID_PROJECT", message: "Clipboard contains duplicate clip ids"});
  const minStart = Math.min(...command.clips.map((clip) => clip.start));
  const tracksById = new Map(project.tracks.map((track) => [track.id, track]));
  const mediaIds = new Set(project.media.map((item) => item.id));
  const usedClipIds = new Set(project.clips.map((clip) => clip.id));
  const usedKeyframeIds = new Set(project.clips.flatMap((clip) => clip.keyframes.map((keyframe) => keyframe.id)));
  const usedGroupIds = new Set(project.clips.flatMap((clip) => clip.linkedGroupId ? [clip.linkedGroupId] : []));
  const clipIdMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();
  for (const clip of command.clips) {
    const trackId = command.trackMap?.[clip.trackId] ?? clip.trackId;
    const track = tracksById.get(trackId);
    if (!track) return failure(project, {code: "TRACK_NOT_FOUND", message: `Track ${trackId} was not found`, entityId: trackId});
    if (track.locked) return failure(project, {code: "TRACK_LOCKED", message: `${track.name} is locked`, entityId: track.id});
    if (!isClipCompatibleWithTrack(clip, track)) return failure(project, {code: "INCOMPATIBLE_TRACK", message: `${clip.name} is incompatible with ${track.name}`, entityId: clip.id});
    if (clip.sourceMediaId && !mediaIds.has(clip.sourceMediaId)) return failure(project, {code: "INVALID_SOURCE_RANGE", message: `${clip.name} references missing source media`, entityId: clip.id});
    clipIdMap.set(clip.id, uniqueId(`${command.idBase}-${clip.id}`, usedClipIds));
    if (clip.linkedGroupId && !groupIdMap.has(clip.linkedGroupId)) groupIdMap.set(clip.linkedGroupId, uniqueId(`${command.idBase}-link-${clip.linkedGroupId}`, usedGroupIds));
  }
  const created = command.clips.map((clip) => ({
    ...structuredClone(clip),
    id: clipIdMap.get(clip.id) as string,
    name: `${clip.name} copy`,
    trackId: command.trackMap?.[clip.trackId] ?? clip.trackId,
    start: command.atFrame + clip.start - minStart,
    linkedGroupId: clip.linkedGroupId ? groupIdMap.get(clip.linkedGroupId) : undefined,
    keyframes: clip.keyframes.map((keyframe) => ({...keyframe, id: uniqueId(`${command.idBase}-${keyframe.id}`, usedKeyframeIds)})),
  }));
  const usedTransitionIds = new Set(project.transitions.map((transition) => transition.id));
  const clonedTransitions = (command.transitions ?? [])
    .filter((transition) => sourceIds.has(transition.fromClipId) && sourceIds.has(transition.toClipId))
    .map((transition) => ({
      ...transition,
      id: uniqueId(`${command.idBase}-${transition.id}`, usedTransitionIds),
      fromClipId: clipIdMap.get(transition.fromClipId) as string,
      toClipId: clipIdMap.get(transition.toClipId) as string,
    }));
  const changed: EditorProject = {...project, clips: [...project.clips, ...created], transitions: [...project.transitions, ...clonedTransitions]};
  return finish(project, changed, {
    affectedClipIds: created.map((clip) => clip.id),
    createdClipIds: created.map((clip) => clip.id),
    removedClipIds: [],
  });
};

const executePlaceMedia = (project: EditorProject, command: PlaceMediaCommand): CommandResult => {
  if (!command.items.length) return failure(project, {code: "EMPTY_SELECTION", message: "Media placement requires at least one item"});
  if (!Number.isInteger(command.atFrame) || command.atFrame < 0) return failure(project, {code: "INVALID_FRAME", message: "Placement frame must be a nonnegative whole frame"});
  if (typeof command.idBase !== "string" || !command.idBase.trim()) return failure(project, {code: "INVALID_TRACK_TARGET", message: "Media placement requires a deterministic id base"});
  const tracksById = new Map(project.tracks.map((track) => [track.id, track]));
  const mediaById = new Map(project.media.map((item) => [item.id, item]));
  const usedClipIds = new Set(project.clips.map((clip) => clip.id));
  const usedGroupIds = new Set(project.clips.flatMap((clip) => clip.linkedGroupId ? [clip.linkedGroupId] : []));
  const linkedGroups = new Map<string, string>();
  const incoming: EditorClip[] = [];
  for (const [index, item] of command.items.entries()) {
    const media = mediaById.get(item.mediaId);
    const track = tracksById.get(item.trackId);
    if (!media) return failure(project, {code: "INVALID_SOURCE_RANGE", message: `Media ${item.mediaId} was not found`, entityId: item.mediaId});
    if (!track) return failure(project, {code: "TRACK_NOT_FOUND", message: `Track ${item.trackId} was not found`, entityId: item.trackId});
    if (track.locked) return failure(project, {code: "TRACK_LOCKED", message: `${track.name} is locked`, entityId: track.id});
    if (!isClipCompatibleWithTrack({kind: media.kind}, track)) return failure(project, {code: "INCOMPATIBLE_TRACK", message: `${media.name} is incompatible with ${track.name}`, entityId: media.id});
    const duration = Math.round(item.duration ?? media.duration);
    const offsetFrames = Math.round(item.offsetFrames ?? 0);
    const sourceStart = item.sourceStart ?? 0;
    if (duration < MIN_CLIP_DURATION) return failure(project, {code: "INVALID_DURATION", message: `${media.name} must be at least ${MIN_CLIP_DURATION} frames`, entityId: media.id});
    if (!Number.isInteger(offsetFrames) || command.atFrame + offsetFrames < 0) return failure(project, {code: "INVALID_FRAME", message: `${media.name} has an invalid placement offset`, entityId: media.id});
    if (!Number.isFinite(sourceStart) || sourceStart < 0) return failure(project, {code: "INVALID_SOURCE_RANGE", message: `${media.name} has an invalid source start`, entityId: media.id});
    let linkedGroupId: string | undefined;
    if (item.linkedKey) {
      linkedGroupId = linkedGroups.get(item.linkedKey);
      if (!linkedGroupId) {
        linkedGroupId = uniqueId(`${command.idBase}-link-${item.linkedKey}`, usedGroupIds);
        linkedGroups.set(item.linkedKey, linkedGroupId);
      }
    }
    incoming.push({
      id: uniqueId(`${command.idBase}-${item.mediaId}-${index + 1}`, usedClipIds),
      name: media.name,
      kind: media.kind,
      trackId: track.id,
      start: command.atFrame + offsetFrames,
      duration,
      sourceStart,
      src: media.src,
      color: media.color,
      volume: media.kind === "audio" ? 0.65 : 0.8,
      fadeIn: 0,
      fadeOut: 0,
      audioMuted: false,
      transform: {...DEFAULT_TRANSFORM},
      effects: {...DEFAULT_EFFECTS},
      keyframes: [],
      linkedGroupId,
      sourceMediaId: media.id,
    });
  }

  if (command.mode === "insert") {
    const span = Math.max(...incoming.map((clip) => clip.start + clip.duration - command.atFrame));
    const rippleTrackIds = new Set(command.rippleTrackIds?.length ? command.rippleTrackIds : incoming.map((clip) => clip.trackId));
    for (const trackId of rippleTrackIds) {
      const track = tracksById.get(trackId);
      if (!track) return failure(project, {code: "TRACK_NOT_FOUND", message: `Ripple track ${trackId} was not found`, entityId: trackId});
      if (track.locked) return failure(project, {code: "TRACK_LOCKED", message: `${track.name} is locked`, entityId: track.id});
    }
    const straddler = project.clips.find((clip) => rippleTrackIds.has(clip.trackId) && clip.start < command.atFrame && clip.start + clip.duration > command.atFrame);
    if (straddler) return failure(project, {code: "PLACEMENT_CONFLICT", message: `Insert point crosses ${straddler.name}; split it first`, entityId: straddler.id});
    const baseShifts = new Map(project.clips.filter((clip) => rippleTrackIds.has(clip.trackId) && clip.start >= command.atFrame).map((clip) => [clip.id, span]));
    const synchronized = synchronizeShifts(project, baseShifts, new Set());
    if (!synchronized.ok) return failure(project, {
      code: synchronized.reason === "locked" ? "TRACK_LOCKED" : "LINKED_OPERATION_CONFLICT",
      message: synchronized.reason === "locked" ? "Insert would move media on a locked track" : "Insert would desynchronize linked media",
      entityId: synchronized.clipId,
    });
    const changed: EditorProject = {
      ...project,
      clips: [...project.clips.map((clip) => ({...clip, start: clip.start + (synchronized.shifts.get(clip.id) ?? 0)})), ...incoming],
    };
    return finish(project, changed, {
      affectedClipIds: [...new Set([...synchronized.shifts.keys(), ...incoming.map((clip) => clip.id)])],
      createdClipIds: incoming.map((clip) => clip.id),
      removedClipIds: [],
    });
  }

  const rangesByTrack = new Map<string, Array<{start: number; end: number}>>();
  for (const clip of incoming) {
    const ranges = rangesByTrack.get(clip.trackId);
    const range = {start: clip.start, end: clip.start + clip.duration};
    if (ranges) ranges.push(range);
    else rangesByTrack.set(clip.trackId, [range]);
  }
  for (const [trackId, ranges] of rangesByTrack) {
    const merged: Array<{start: number; end: number}> = [];
    for (const range of ranges.sort((a, b) => a.start - b.start || a.end - b.end)) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({...range});
    }
    rangesByTrack.set(trackId, merged);
  }
  const touched = new Map<string, {start: number; end: number}>();
  for (const clip of project.clips) {
    const intersections = (rangesByTrack.get(clip.trackId) ?? []).filter((range) => clip.start < range.end && clip.start + clip.duration > range.start);
    if (intersections.length > 1) return failure(project, {code: "PLACEMENT_CONFLICT", message: `${clip.name} crosses multiple overwrite ranges`, entityId: clip.id});
    if (intersections[0]) touched.set(clip.id, intersections[0]);
  }
  const touchedIds = new Set(touched.keys());
  const totalByGroup = new Map<string, number>();
  const touchedByGroup = new Map<string, number>();
  for (const clip of project.clips) {
    if (!clip.linkedGroupId) continue;
    totalByGroup.set(clip.linkedGroupId, (totalByGroup.get(clip.linkedGroupId) ?? 0) + 1);
    if (touchedIds.has(clip.id)) touchedByGroup.set(clip.linkedGroupId, (touchedByGroup.get(clip.linkedGroupId) ?? 0) + 1);
  }
  const conflictingGroup = [...touchedByGroup].find(([groupId, count]) => count < (totalByGroup.get(groupId) ?? 0))?.[0];
  const linkedConflict = conflictingGroup ? project.clips.find((clip) => clip.linkedGroupId === conflictingGroup && touchedIds.has(clip.id)) : undefined;
  if (linkedConflict) return failure(project, {code: "LINKED_OPERATION_CONFLICT", message: `Overwrite would partially replace linked media for ${linkedConflict.name}`, entityId: linkedConflict.id});
  const usedKeyframeIds = new Set(project.clips.flatMap((clip) => clip.keyframes.map((keyframe) => keyframe.id)));
  const rightByOriginal = new Map<string, string>();
  const rightGroupByOriginal = new Map<string, string>();
  const removedClipIds: string[] = [];
  const existing: EditorClip[] = [];
  for (const clip of project.clips) {
    const range = touched.get(clip.id);
    if (!range) {
      existing.push(clip);
      continue;
    }
    const clipEnd = clip.start + clip.duration;
    if (range.start <= clip.start && range.end >= clipEnd) {
      removedClipIds.push(clip.id);
      continue;
    }
    if (clip.start < range.start && clipEnd > range.end) {
      const leftDuration = range.start - clip.start;
      const rightOffset = range.end - clip.start;
      const rightId = uniqueId(`${command.idBase}-${clip.id}-overwrite-right`, usedClipIds);
      if (clip.linkedGroupId && !rightGroupByOriginal.has(clip.linkedGroupId)) rightGroupByOriginal.set(clip.linkedGroupId, uniqueId(`${command.idBase}-${clip.linkedGroupId}-overwrite-right`, usedGroupIds));
      const left = {...clip, duration: leftDuration, fadeOut: 0, keyframes: clip.keyframes.filter((keyframe) => keyframe.frame < leftDuration).map((keyframe) => ({...keyframe}))};
      const rightDuration = clipEnd - range.end;
      const right = {
        ...clip,
        id: rightId,
        name: `${clip.name} B`,
        start: range.end,
        duration: rightDuration,
        sourceStart: clip.sourceStart + rightOffset * (clip.playbackRate ?? 1),
        fadeIn: 0,
        fadeOut: Math.min(clip.fadeOut, rightDuration),
        linkedGroupId: clip.linkedGroupId ? rightGroupByOriginal.get(clip.linkedGroupId) : undefined,
        keyframes: clip.keyframes.filter((keyframe) => keyframe.frame >= rightOffset).map((keyframe) => ({...keyframe, id: uniqueId(`${command.idBase}-${keyframe.id}-overwrite-right`, usedKeyframeIds), frame: keyframe.frame - rightOffset})),
      };
      existing.push(left, right);
      rightByOriginal.set(clip.id, rightId);
      continue;
    }
    if (clip.start < range.start) {
      const duration = range.start - clip.start;
      existing.push({...clip, duration, fadeOut: 0, fadeIn: Math.min(clip.fadeIn, duration), keyframes: clip.keyframes.filter((keyframe) => keyframe.frame < duration).map((keyframe) => ({...keyframe}))});
      continue;
    }
    const cut = range.end - clip.start;
    const duration = clipEnd - range.end;
    existing.push({
      ...clip,
      start: range.end,
      duration,
      sourceStart: clip.sourceStart + cut * (clip.playbackRate ?? 1),
      fadeIn: 0,
      fadeOut: Math.min(clip.fadeOut, duration),
      keyframes: clip.keyframes.filter((keyframe) => keyframe.frame >= cut).map((keyframe) => ({...keyframe, frame: keyframe.frame - cut})),
    });
  }
  const changed: EditorProject = {
    ...project,
    clips: [...existing, ...incoming],
    transitions: project.transitions.map((transition) => ({...transition, fromClipId: rightByOriginal.get(transition.fromClipId) ?? transition.fromClipId})),
  };
  return finish(project, changed, {
    affectedClipIds: [...new Set([...touchedIds, ...incoming.map((clip) => clip.id)])],
    createdClipIds: [...incoming.map((clip) => clip.id), ...rightByOriginal.values()],
    removedClipIds,
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isJsonSerializable = (value: unknown) => {
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
};
const commandKeyframeProperties = new Set([
  "transform.x", "transform.y", "transform.scale", "transform.rotation", "transform.opacity",
  "effects.brightness", "effects.contrast", "effects.saturation", "effects.blur", "effects.temperature", "effects.tint",
  "effects.exposure", "effects.highlights", "effects.shadows", "effects.whites", "effects.blacks", "effects.vibrance",
  "effects.hue", "effects.fade", "effects.sharpen", "effects.vignette", "effects.grain", "effects.glow", "audio.volume",
]);
const isTransformPayload = (value: unknown) => isRecord(value) && ["x", "y", "scale", "rotation", "opacity"].every((key) => isFiniteNumber(value[key]))
  && Object.values(value).every((item) => isFiniteNumber(item));
const isEffectsPayload = (value: unknown) => isRecord(value)
  && ["enabled", "colorEnabled", "blurEnabled", "vignetteEnabled", "grainEnabled", "glowEnabled", "maskEnabled", "maskInverted"].every((key) => typeof value[key] === "boolean")
  && ["brightness", "contrast", "saturation", "blur", "temperature", "tint", "exposure", "highlights", "shadows", "whites", "blacks", "vibrance", "hue", "fade", "sharpen", "vignette", "grain", "glow", "maskX", "maskY", "maskSize", "maskFeather"].every((key) => isFiniteNumber(value[key]))
  && typeof value.look === "string" && Object.values(value).every((item) => ["boolean", "number", "string"].includes(typeof item));
const isTextStylePayload = (value: unknown) => isRecord(value)
  && ["fontFamily", "color", "backgroundColor", "strokeColor"].every((key) => typeof value[key] === "string")
  && ["fontSize", "fontWeight", "backgroundOpacity", "letterSpacing", "lineHeight", "strokeWidth"].every((key) => isFiniteNumber(value[key]))
  && ["left", "center", "right"].includes(String(value.textAlign))
  && Object.values(value).every((item) => ["number", "string"].includes(typeof item));
const isClipCommandPayload = (value: unknown): value is EditorClip => isRecord(value)
  && isJsonSerializable(value)
  && typeof value.id === "string" && typeof value.name === "string" && typeof value.trackId === "string"
  && typeof value.kind === "string" && ["video", "image", "audio", "title", "caption"].includes(value.kind)
  && Number.isInteger(value.start) && Number.isInteger(value.duration) && isFiniteNumber(value.sourceStart)
  && typeof value.color === "string" && isFiniteNumber(value.volume)
  && Number.isInteger(value.fadeIn) && Number.isInteger(value.fadeOut) && typeof value.audioMuted === "boolean"
  && isTransformPayload(value.transform) && isEffectsPayload(value.effects) && Array.isArray(value.keyframes)
  && value.keyframes.every((keyframe) => isRecord(keyframe) && typeof keyframe.id === "string" && typeof keyframe.property === "string"
    && commandKeyframeProperties.has(keyframe.property) && Number.isInteger(keyframe.frame) && isFiniteNumber(keyframe.value) && (keyframe.easing === "linear" || keyframe.easing === "ease-in-out"))
  && (value.src === undefined || typeof value.src === "string") && (value.text === undefined || typeof value.text === "string")
  && (value.textStyle === undefined || isTextStylePayload(value.textStyle))
  && (value.playbackRate === undefined || isFiniteNumber(value.playbackRate))
  && (value.preservePitch === undefined || typeof value.preservePitch === "boolean")
  && (value.linkedGroupId === undefined || typeof value.linkedGroupId === "string")
  && (value.sourceMediaId === undefined || typeof value.sourceMediaId === "string");
const isTransitionCommandPayload = (value: unknown) => isRecord(value) && typeof value.id === "string"
  && typeof value.fromClipId === "string" && typeof value.toClipId === "string"
  && typeof value.type === "string" && ["cross-dissolve", "dip-to-black", "wipe-left", "slide-left"].includes(value.type)
  && Number.isInteger(value.duration);

const isTimelineCommand = (value: unknown): value is TimelineCommand => {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  const optionalBoolean = (key: string) => value[key] === undefined || typeof value[key] === "boolean";
  if (value.type === "split-clip") return typeof value.clipId === "string" && Number.isInteger(value.frame) && optionalBoolean("includeLinked");
  if (value.type === "ripple-delete") return Array.isArray(value.clipIds) && value.clipIds.every((id) => typeof id === "string") && optionalBoolean("includeLinked");
  if (value.type === "retime-clip") return typeof value.clipId === "string" && typeof value.playbackRate === "number" && optionalBoolean("ripple") && optionalBoolean("preservePitch") && optionalBoolean("includeLinked");
  if (value.type === "move-clips") return Array.isArray(value.clipIds) && value.clipIds.every((id) => typeof id === "string")
    && Number.isInteger(value.deltaFrames) && optionalBoolean("includeLinked")
    && (value.trackAssignments === undefined || (isRecord(value.trackAssignments) && Object.values(value.trackAssignments).every((id) => typeof id === "string")));
  if (value.type === "trim-clip") return typeof value.clipId === "string" && (value.edge === "start" || value.edge === "end")
    && Number.isInteger(value.deltaFrames) && optionalBoolean("ripple") && optionalBoolean("includeLinked");
  if (value.type === "clone-clips") return Array.isArray(value.clips) && value.clips.every(isClipCommandPayload)
    && (value.transitions === undefined || (Array.isArray(value.transitions) && value.transitions.every(isTransitionCommandPayload)))
    && Number.isInteger(value.atFrame) && typeof value.idBase === "string"
    && (value.trackMap === undefined || (isRecord(value.trackMap) && Object.values(value.trackMap).every((id) => typeof id === "string")));
  if (value.type === "place-media") return (value.mode === "insert" || value.mode === "overwrite") && Number.isInteger(value.atFrame)
    && typeof value.idBase === "string" && Array.isArray(value.items)
    && value.items.every((item) => isRecord(item) && typeof item.mediaId === "string" && typeof item.trackId === "string"
      && (item.offsetFrames === undefined || Number.isInteger(item.offsetFrames))
      && (item.duration === undefined || isFiniteNumber(item.duration))
      && (item.sourceStart === undefined || isFiniteNumber(item.sourceStart))
      && (item.linkedKey === undefined || typeof item.linkedKey === "string"))
    && (value.rippleTrackIds === undefined || (Array.isArray(value.rippleTrackIds) && value.rippleTrackIds.every((id) => typeof id === "string")));
  return value.type === "restore-project" && isRecord(value.project);
};

export const executeTimelineCommand = (input: EditorProject, command: TimelineCommand): CommandResult => {
  const prepared = prepare(input);
  if (!prepared.ok) return prepared;
  if (!isTimelineCommand(command)) return failure(input, {code: "INVALID_COMMAND", message: "Timeline command payload is malformed or unsupported"});
  if (command.type === "restore-project") {
    const trusted = trustedRestores.get(command);
    if (!trusted || trusted.expectedInput !== projectFingerprint(prepared.project)) {
      return failure(input, {code: "INVALID_RESTORE", message: "Restore command is not a current kernel-issued inverse"});
    }
    const restored = prepare(trusted.project);
    if (!restored.ok) return restored;
    return finish(prepared.project, restored.project, {affectedClipIds: restored.project.clips.map((clip) => clip.id), createdClipIds: [], removedClipIds: []}, true);
  }
  const result = command.type === "split-clip"
    ? executeSplit(prepared.project, command)
    : command.type === "ripple-delete"
      ? executeRippleDelete(prepared.project, command)
      : command.type === "retime-clip"
        ? executeRetime(prepared.project, command)
        : command.type === "move-clips"
          ? executeMove(prepared.project, command)
          : command.type === "trim-clip"
            ? executeTrim(prepared.project, command)
            : command.type === "clone-clips"
              ? executeClone(prepared.project, command)
              : executePlaceMedia(prepared.project, command);
  if (!result.ok) return {...result, project: cloneProject(input)};
  return result;
};

export const splitClip = (project: EditorProject, clipId: string, frame: number, includeLinked = true) => executeTimelineCommand(project, {type: "split-clip", clipId, frame, includeLinked});
export const rippleDelete = (project: EditorProject, clipIds: string[], includeLinked = true) => executeTimelineCommand(project, {type: "ripple-delete", clipIds, includeLinked});
export const retimeClip = (project: EditorProject, command: Omit<RetimeClipCommand, "type">) => executeTimelineCommand(project, {type: "retime-clip", ...command});
export const moveClips = (project: EditorProject, command: Omit<MoveClipsCommand, "type">) => executeTimelineCommand(project, {type: "move-clips", ...command});
export const trimClip = (project: EditorProject, command: Omit<TrimClipCommand, "type">) => executeTimelineCommand(project, {type: "trim-clip", ...command});
export const cloneClips = (project: EditorProject, command: Omit<CloneClipsCommand, "type">) => executeTimelineCommand(project, {type: "clone-clips", ...command});
export const placeMedia = (project: EditorProject, command: Omit<PlaceMediaCommand, "type">) => executeTimelineCommand(project, {type: "place-media", ...command});
