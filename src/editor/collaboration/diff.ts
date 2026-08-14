import type {EditorClip, EditorProject, EditorSequence} from "../types";
import type {SemanticChange, SemanticChangeCategory, ThreeWayConflict} from "./types";

const json = (value: unknown) => JSON.stringify(value);
const changed = (left: unknown, right: unknown) => json(left) !== json(right);

const sequenceViews = (project: EditorProject) => {
  const values = new Map(project.sequences.map((sequence) => [sequence.id, sequence]));
  values.set(project.activeSequenceId, {
    id: project.activeSequenceId,
    name: values.get(project.activeSequenceId)?.name ?? "Sequence",
    width: project.width, height: project.height, fps: project.fps, durationInFrames: project.durationInFrames,
    tracks: project.tracks, clips: project.clips, markers: project.markers, transitions: project.transitions,
  });
  return values;
};

const clipGroups = (clip: EditorClip) => ({
  settings: {name: clip.name, kind: clip.kind, color: clip.color},
  moved: {start: clip.start, trackId: clip.trackId},
  trimmed: {duration: clip.duration, sourceStart: clip.sourceStart},
  retimed: {playbackRate: clip.playbackRate ?? 1, preservePitch: clip.preservePitch ?? true},
  source: {src: clip.src, sourceMediaId: clip.sourceMediaId, nestedSequenceId: clip.nestedSequenceId},
  effects: {transform: clip.transform, effects: clip.effects, colorGrade: clip.colorGrade, effectMasks: clip.effectMasks, keyframes: clip.keyframes},
  text: {text: clip.text, textStyle: clip.textStyle},
  audio: {volume: clip.volume, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, audioMuted: clip.audioMuted},
});

const compareEntityList = <T extends {id: string}>(before: T[], after: T[], descriptor: {entityType: SemanticChange["entityType"]; sequenceId?: string; label: (item: T) => string; groups: (item: T) => Record<string, unknown>}) => {
  const result: SemanticChange[] = [];
  const left = new Map(before.map((item) => [item.id, item]));
  const right = new Map(after.map((item) => [item.id, item]));
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const previous = left.get(id);
    const next = right.get(id);
    if (!previous && next) result.push({entityType: descriptor.entityType, entityId: id, sequenceId: descriptor.sequenceId, category: "added", label: descriptor.label(next), after: next});
    else if (previous && !next) result.push({entityType: descriptor.entityType, entityId: id, sequenceId: descriptor.sequenceId, category: "removed", label: descriptor.label(previous), before: previous});
    else if (previous && next) {
      const previousGroups = descriptor.groups(previous);
      const nextGroups = descriptor.groups(next);
      for (const key of new Set([...Object.keys(previousGroups), ...Object.keys(nextGroups)])) if (changed(previousGroups[key], nextGroups[key])) result.push({entityType: descriptor.entityType, entityId: id, sequenceId: descriptor.sequenceId, category: key as SemanticChangeCategory, label: descriptor.label(next), before: previousGroups[key], after: nextGroups[key]});
    }
  }
  return result;
};

export const diffProjects = (before: EditorProject, after: EditorProject): SemanticChange[] => {
  const result: SemanticChange[] = [];
  if (changed({name: before.name}, {name: after.name})) result.push({entityType: "project", entityId: "project", category: "settings", label: after.name, before: {name: before.name}, after: {name: after.name}});
  result.push(...compareEntityList(before.media, after.media, {entityType: "media", label: (item) => item.name, groups: (item) => ({content: item})}));
  const leftSequences = sequenceViews(before);
  const rightSequences = sequenceViews(after);
  for (const id of new Set([...leftSequences.keys(), ...rightSequences.keys()])) {
    const left = leftSequences.get(id);
    const right = rightSequences.get(id);
    if (!left && right) { result.push({entityType: "sequence", entityId: id, category: "added", label: right.name, after: right}); continue; }
    if (left && !right) { result.push({entityType: "sequence", entityId: id, category: "removed", label: left.name, before: left}); continue; }
    if (!left || !right) continue;
    if (changed({name: left.name, width: left.width, height: left.height, fps: left.fps, durationInFrames: left.durationInFrames}, {name: right.name, width: right.width, height: right.height, fps: right.fps, durationInFrames: right.durationInFrames})) result.push({entityType: "sequence", entityId: id, sequenceId: id, category: "settings", label: right.name});
    result.push(...compareEntityList(left.tracks, right.tracks, {entityType: "track", sequenceId: id, label: (item) => item.name, groups: (item) => ({settings: item})}));
    result.push(...compareEntityList(left.clips, right.clips, {entityType: "clip", sequenceId: id, label: (item) => item.name, groups: clipGroups}));
    result.push(...compareEntityList(left.markers, right.markers, {entityType: "marker", sequenceId: id, label: (item) => item.label, groups: (item) => ({content: item})}));
    result.push(...compareEntityList(left.transitions, right.transitions, {entityType: "transition", sequenceId: id, label: (item) => item.type, groups: (item) => ({content: item})}));
  }
  return result;
};

type EntityRecord = {type: string; id: string; sequenceId?: string; value: Record<string, unknown>};

const entityRecords = (project: EditorProject) => {
  const records: EntityRecord[] = [{type: "project", id: "project", value: {name: project.name}}];
  project.media.forEach((item) => records.push({type: "media", id: item.id, value: item as unknown as Record<string, unknown>}));
  for (const sequence of sequenceViews(project).values()) {
    const sequenceId = sequence.id;
    records.push({type: "sequence", id: sequenceId, sequenceId, value: {name: sequence.name, width: sequence.width, height: sequence.height, fps: sequence.fps, durationInFrames: sequence.durationInFrames}});
    sequence.tracks.forEach((item) => records.push({type: "track", id: item.id, sequenceId, value: item as unknown as Record<string, unknown>}));
    sequence.clips.forEach((item) => records.push({type: "clip", id: item.id, sequenceId, value: item as unknown as Record<string, unknown>}));
    sequence.markers.forEach((item) => records.push({type: "marker", id: item.id, sequenceId, value: item as unknown as Record<string, unknown>}));
    sequence.transitions.forEach((item) => records.push({type: "transition", id: item.id, sequenceId, value: item as unknown as Record<string, unknown>}));
  }
  return new Map(records.map((record) => [`${record.type}:${record.sequenceId ?? "global"}:${record.id}`, record]));
};

const flatten = (value: unknown, prefix = "", output = new Map<string, unknown>()): Map<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) if (key !== "id") flatten(child, prefix ? `${prefix}.${key}` : key, output);
  } else output.set(prefix, value);
  return output;
};

export const detectThreeWayConflicts = (base: EditorProject, local: EditorProject, remote: EditorProject): ThreeWayConflict[] => {
  const baseEntities = entityRecords(base);
  const localEntities = entityRecords(local);
  const remoteEntities = entityRecords(remote);
  const conflicts: ThreeWayConflict[] = [];
  for (const entityKey of new Set([...baseEntities.keys(), ...localEntities.keys(), ...remoteEntities.keys()])) {
    const baseEntity = baseEntities.get(entityKey);
    const localEntity = localEntities.get(entityKey);
    const remoteEntity = remoteEntities.get(entityKey);
    const reference = localEntity ?? remoteEntity ?? baseEntity;
    if (!reference) continue;
    if (baseEntity && !localEntity && remoteEntity && changed(baseEntity.value, remoteEntity.value)) {
      conflicts.push({entityType: reference.type, entityId: reference.id, sequenceId: reference.sequenceId, path: "_entity", reason: "delete-vs-edit", base: baseEntity.value, local: undefined, remote: remoteEntity.value});
      continue;
    }
    if (baseEntity && localEntity && !remoteEntity && changed(baseEntity.value, localEntity.value)) {
      conflicts.push({entityType: reference.type, entityId: reference.id, sequenceId: reference.sequenceId, path: "_entity", reason: "delete-vs-edit", base: baseEntity.value, local: localEntity.value, remote: undefined});
      continue;
    }
    const baseFields = flatten(baseEntity?.value ?? {});
    const localFields = flatten(localEntity?.value ?? {});
    const remoteFields = flatten(remoteEntity?.value ?? {});
    for (const path of new Set([...baseFields.keys(), ...localFields.keys(), ...remoteFields.keys()])) {
      const baseValue = baseFields.get(path);
      const localValue = localFields.get(path);
      const remoteValue = remoteFields.get(path);
      if (changed(baseValue, localValue) && changed(baseValue, remoteValue) && changed(localValue, remoteValue)) conflicts.push({entityType: reference.type, entityId: reference.id, sequenceId: reference.sequenceId, path, reason: "divergent-edit", base: baseValue, local: localValue, remote: remoteValue});
    }
  }
  return conflicts;
};

export const sequenceFromProject = (project: EditorProject): EditorSequence => sequenceViews(project).get(project.activeSequenceId)!;
