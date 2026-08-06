import type {ClipKeyframe, EditorClip, EditorProject} from "../types";
import {
  MAX_PLAYBACK_RATE,
  MIN_CLIP_DURATION,
  MIN_PLAYBACK_RATE,
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
export type RestoreProjectCommand = {type: "restore-project"; project: EditorProject};
export type TimelineCommand = SplitClipCommand | RippleDeleteCommand | RetimeClipCommand | RestoreProjectCommand;

export type CommandErrorCode =
  | "INVALID_PROJECT"
  | "CLIP_NOT_FOUND"
  | "TRACK_LOCKED"
  | "INVALID_SPLIT_POINT"
  | "INVALID_PLAYBACK_RATE"
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

export const executeTimelineCommand = (input: EditorProject, command: TimelineCommand): CommandResult => {
  const prepared = prepare(input);
  if (!prepared.ok) return prepared;
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
      : executeRetime(prepared.project, command);
  if (!result.ok) return {...result, project: cloneProject(input)};
  return result;
};

export const splitClip = (project: EditorProject, clipId: string, frame: number, includeLinked = true) => executeTimelineCommand(project, {type: "split-clip", clipId, frame, includeLinked});
export const rippleDelete = (project: EditorProject, clipIds: string[], includeLinked = true) => executeTimelineCommand(project, {type: "ripple-delete", clipIds, includeLinked});
export const retimeClip = (project: EditorProject, command: Omit<RetimeClipCommand, "type">) => executeTimelineCommand(project, {type: "retime-clip", ...command});
