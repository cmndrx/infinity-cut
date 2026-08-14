import type {EditorProject, EditorSequence, EditorTrack} from "./types";

const clone = <T,>(value: T): T => structuredClone(value);

export const sequenceSnapshot = (project: EditorProject): EditorSequence => ({
  id: project.activeSequenceId,
  name: project.sequences.find((sequence) => sequence.id === project.activeSequenceId)?.name ?? "Sequence 01",
  width: project.width,
  height: project.height,
  fps: project.fps,
  durationInFrames: project.durationInFrames,
  tracks: clone(project.tracks),
  clips: clone(project.clips),
  markers: clone(project.markers),
  transitions: clone(project.transitions),
});

export const syncActiveSequence = (project: EditorProject): EditorProject => {
  const next = clone(project);
  const snapshot = sequenceSnapshot(next);
  const index = next.sequences.findIndex((sequence) => sequence.id === next.activeSequenceId);
  if (index >= 0) next.sequences[index] = snapshot;
  else next.sequences.push(snapshot);
  return next;
};

export const switchActiveSequence = (project: EditorProject, sequenceId: string): EditorProject => {
  const synced = syncActiveSequence(project);
  const target = synced.sequences.find((sequence) => sequence.id === sequenceId);
  if (!target) throw new Error("Sequence no longer exists");
  return {
    ...synced,
    activeSequenceId: target.id,
    width: target.width,
    height: target.height,
    fps: target.fps,
    durationInFrames: target.durationInFrames,
    tracks: clone(target.tracks),
    clips: clone(target.clips),
    markers: clone(target.markers),
    transitions: clone(target.transitions),
  };
};

export const projectViewForSequence = (project: EditorProject, sequenceId: string): EditorProject | null => {
  const synced = syncActiveSequence(project);
  const target = synced.sequences.find((sequence) => sequence.id === sequenceId);
  if (!target) return null;
  return {
    ...synced,
    activeSequenceId: target.id,
    width: target.width,
    height: target.height,
    fps: target.fps,
    durationInFrames: target.durationInFrames,
    tracks: clone(target.tracks),
    clips: clone(target.clips),
    markers: clone(target.markers),
    transitions: clone(target.transitions),
  };
};

const defaultTrack = (id: string, kind: EditorTrack["kind"]): EditorTrack => ({
  id, name: id.toUpperCase(), kind, muted: false, solo: false, volume: 1, hidden: false, locked: false,
});

export const createSequence = (project: EditorProject, name?: string): EditorSequence => {
  const id = `sequence-${Date.now()}-${project.sequences.length + 1}`;
  return {
    id,
    name: name?.trim() || `Sequence ${String(project.sequences.length + 1).padStart(2, "0")}`,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationInFrames: project.fps * 300,
    tracks: [defaultTrack("c1", "caption"), defaultTrack("v3", "video"), defaultTrack("v2", "video"), defaultTrack("v1", "video"), defaultTrack("a1", "audio"), defaultTrack("a2", "audio")],
    clips: [], markers: [], transitions: [],
  };
};

export const sequenceContains = (project: EditorProject, rootId: string, soughtId: string, seen = new Set<string>()): boolean => {
  if (rootId === soughtId) return true;
  if (seen.has(rootId)) return false;
  seen.add(rootId);
  const view = projectViewForSequence(project, rootId);
  return Boolean(view?.clips.some((clip) => clip.kind === "sequence" && clip.nestedSequenceId && sequenceContains(project, clip.nestedSequenceId, soughtId, seen)));
};

export const canNestSequence = (project: EditorProject, childId: string) => childId !== project.activeSequenceId && !sequenceContains(project, childId, project.activeSequenceId);
