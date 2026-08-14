import {sampleProject} from "./project";
import {normalizeFrameRate} from "./frame-rate";
import {normalizeColorGrade} from "./color-math";
import {createDefaultMask, normalizeEffectMask} from "./masks";
import type {EditorClip, EditorProject, EditorSequence, EditorTrack, ProjectLut} from "./types";
import {syncActiveSequence} from "./sequences";
import {DEFAULT_CAPTION_STYLE, DEFAULT_EFFECTS, DEFAULT_TITLE_STYLE} from "./types";

export const PROJECT_LIBRARY_KEY = "infinity-cut-project-library-v2";
export const LEGACY_PROJECT_KEY = "infinity-cut-project";
export const PROJECT_SCHEMA_VERSION = 4;

const MAX_RECOVERY_VERSIONS = 8;
const RECOVERY_INTERVAL_MS = 30_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type RecoveryVersion = {
  id: string;
  savedAt: number;
  project: EditorProject;
};

export type StoredProject = {
  id: string;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  createdAt: number;
  updatedAt: number;
  lastRecoveryAt: number;
  project: EditorProject;
  recoveryVersions: RecoveryVersion[];
};

export type ProjectLibrary = {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  activeProjectId: string | null;
  projects: StoredProject[];
};

export type NewProjectSettings = {
  name: string;
  width: number;
  height: number;
  fps: number;
};

export type DirectorsCutProjectFile = {
  application: "Directors Cut Pro";
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  exportedAt: string;
  project: EditorProject;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let fallbackIdCounter = 0;
const createId = () => globalThis.crypto?.randomUUID?.() ?? `directors-${Date.now()}-${fallbackIdCounter++}`;

const defaultTrack = (id: string, kind: EditorTrack["kind"]): EditorTrack => ({
  id,
  name: id.toUpperCase(),
  kind,
  muted: false,
  solo: false,
  volume: 1,
  hidden: false,
  locked: false,
});

export const createBlankProject = ({name, width, height, fps}: NewProjectSettings): EditorProject => {
  const activeSequenceId = "sequence-1";
  const project: EditorProject = ({
  activeSequenceId,
  sequences: [],
  name: name.trim() || "Untitled Project",
  width,
  height,
  fps,
  durationInFrames: fps * 300,
  markers: [],
  transitions: [],
  mediaBins: [
    {id: "bin-video", name: "Video"},
    {id: "bin-audio", name: "Audio"},
    {id: "bin-graphics", name: "Graphics"},
  ],
  media: [],
  luts: [],
  tracks: [
    defaultTrack("c1", "caption"),
    defaultTrack("v3", "video"),
    defaultTrack("v2", "video"),
    defaultTrack("v1", "video"),
    defaultTrack("a1", "audio"),
    defaultTrack("a2", "audio"),
  ],
  clips: [],
  });
  return syncActiveSequence(project);
};

export const normalizeProject = (value: unknown): EditorProject => {
  if (!value || typeof value !== "object") throw new Error("This is not a Directors Cut Pro project file");
  const parsed = clone(value as EditorProject & {sequences?: EditorSequence[]; activeSequenceId?: string});
  if (!Array.isArray(parsed.tracks) || !Array.isArray(parsed.clips) || !Number.isFinite(parsed.fps) || parsed.fps <= 0) {
    throw new Error("The project is missing its timeline data");
  }

  const fallback = clone(sampleProject);
  parsed.name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Untitled Project";
  parsed.width = Number.isFinite(parsed.width) && parsed.width > 0 ? Math.round(parsed.width) : 1920;
  parsed.height = Number.isFinite(parsed.height) && parsed.height > 0 ? Math.round(parsed.height) : 1080;
  parsed.fps = normalizeFrameRate(parsed.fps) ?? 30;
  parsed.durationInFrames = Number.isFinite(parsed.durationInFrames) && parsed.durationInFrames > 0 ? Math.round(parsed.durationInFrames) : parsed.fps * 300;
  parsed.markers = Array.isArray(parsed.markers) ? parsed.markers : [];
  parsed.transitions = Array.isArray(parsed.transitions) ? parsed.transitions : [];
  parsed.mediaBins = Array.isArray(parsed.mediaBins) && parsed.mediaBins.length ? parsed.mediaBins : fallback.mediaBins;
  parsed.media = Array.isArray(parsed.media) ? parsed.media : [];
  parsed.media = parsed.media.map((item) => ({
    ...item,
    binId: item.binId ?? parsed.mediaBins[0]?.id ?? "bin-video",
    offline: item.offline ?? (item.renderReady === false && item.src.startsWith("blob:")),
    fps: normalizeFrameRate(item.fps),
    durationInSeconds: typeof item.durationInSeconds === "number" && Number.isFinite(item.durationInSeconds) && item.durationInSeconds > 0 ? item.durationInSeconds : undefined,
  }));
  parsed.luts = Array.isArray(parsed.luts) ? parsed.luts.flatMap((lut) => {
    if (!lut || typeof lut !== "object") return [];
    const candidate = lut as ProjectLut;
    if (typeof candidate.id !== "string" || !candidate.id.trim() || typeof candidate.name !== "string"
      || (candidate.kind !== "1d" && candidate.kind !== "3d") || !Number.isInteger(candidate.size) || candidate.size < 2
      || !Array.isArray(candidate.domainMin) || candidate.domainMin.length !== 3
      || !Array.isArray(candidate.domainMax) || candidate.domainMax.length !== 3 || typeof candidate.dataBase64 !== "string") return [];
    return [{...candidate, domainMin: [...candidate.domainMin], domainMax: [...candidate.domainMax]} as ProjectLut];
  }) : [];

  const normalizeClip = (clip: EditorClip): EditorClip => {
    const effects = {...DEFAULT_EFFECTS, ...(clip.effects ?? {})};
    const legacyMasks = effects.maskEnabled
      ? [{
        ...createDefaultMask(`${clip.id}-legacy-mask`, "ellipse", "Legacy Ellipse Mask"),
        inverted: effects.maskInverted,
        x: effects.maskX,
        y: effects.maskY,
        width: effects.maskSize,
        height: effects.maskSize,
        feather: effects.maskFeather,
      }]
      : [];
    return {
      ...clip,
      fadeIn: clip.fadeIn ?? 0,
      fadeOut: clip.fadeOut ?? 0,
      audioMuted: clip.audioMuted ?? false,
      playbackRate: typeof clip.playbackRate === "number" && Number.isFinite(clip.playbackRate) ? Math.max(0.1, Math.min(10, clip.playbackRate)) : 1,
      preservePitch: clip.preservePitch ?? true,
      keyframes: Array.isArray(clip.keyframes) ? clip.keyframes : [],
      sourceMediaId: clip.sourceMediaId ?? parsed.media.find((item) => item.src === clip.src)?.id,
      effects,
      colorGrade: normalizeColorGrade(clip.colorGrade),
      effectMasks: Array.isArray(clip.effectMasks)
        ? clip.effectMasks.map((mask, index) => normalizeEffectMask(mask, `${clip.id}-mask-${index + 1}`))
        : legacyMasks,
      textStyle: clip.kind === "title"
        ? {...DEFAULT_TITLE_STYLE, ...(clip.textStyle ?? {})}
        : clip.kind === "caption"
          ? {...DEFAULT_CAPTION_STYLE, ...(clip.textStyle ?? {})}
          : clip.textStyle,
    };
  };

  if (!parsed.tracks.some((track) => track.kind === "caption")) parsed.tracks.unshift(defaultTrack("c1", "caption"));
  parsed.tracks = parsed.tracks.map((track) => ({...track, solo: track.solo ?? false, volume: track.volume ?? 1}));
  parsed.clips = parsed.clips.map(normalizeClip);
  parsed.activeSequenceId = typeof parsed.activeSequenceId === "string" && parsed.activeSequenceId ? parsed.activeSequenceId : "sequence-1";
  parsed.sequences = Array.isArray(parsed.sequences) ? parsed.sequences : [];
  if (!parsed.sequences.some((sequence) => sequence.id === parsed.activeSequenceId)) {
    parsed.sequences.push({
      id: parsed.activeSequenceId,
      name: "Sequence 01",
      width: parsed.width,
      height: parsed.height,
      fps: parsed.fps,
      durationInFrames: parsed.durationInFrames,
      tracks: clone(parsed.tracks),
      clips: clone(parsed.clips),
      markers: clone(parsed.markers),
      transitions: clone(parsed.transitions),
    });
  }
  parsed.sequences = parsed.sequences.map((sequence) => ({
    ...sequence,
    tracks: Array.isArray(sequence.tracks) ? sequence.tracks.map((track) => ({...track, solo: track.solo ?? false, volume: track.volume ?? 1})) : [],
    clips: Array.isArray(sequence.clips) ? sequence.clips.map(normalizeClip) : [],
    markers: Array.isArray(sequence.markers) ? sequence.markers : [],
    transitions: Array.isArray(sequence.transitions) ? sequence.transitions : [],
  }));
  return syncActiveSequence(parsed);
};

const emptyLibrary = (): ProjectLibrary => ({
  schemaVersion: PROJECT_SCHEMA_VERSION,
  activeProjectId: null,
  projects: [],
});

const readLibrary = (storage: StorageLike): ProjectLibrary => {
  const raw = storage.getItem(PROJECT_LIBRARY_KEY);
  if (!raw) return emptyLibrary();
  try {
    const parsed = JSON.parse(raw) as ProjectLibrary;
    if (![2, 3, PROJECT_SCHEMA_VERSION].includes(Number(parsed.schemaVersion)) || !Array.isArray(parsed.projects)) return emptyLibrary();
    return {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      activeProjectId: typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : null,
      projects: parsed.projects.flatMap((record) => {
        try {
          return [{
            ...record,
            schemaVersion: PROJECT_SCHEMA_VERSION,
            project: normalizeProject(record.project),
            recoveryVersions: Array.isArray(record.recoveryVersions)
              ? record.recoveryVersions.flatMap((version) => {
                try {
                  return [{...version, project: normalizeProject(version.project)}];
                } catch {
                  return [];
                }
              })
              : [],
          }];
        } catch {
          return [];
        }
      }),
    };
  } catch {
    return emptyLibrary();
  }
};

const writeLibrary = (storage: StorageLike, library: ProjectLibrary) => {
  storage.setItem(PROJECT_LIBRARY_KEY, JSON.stringify(library));
};

const createRecord = (project: EditorProject, now = Date.now()): StoredProject => ({
  id: createId(),
  schemaVersion: PROJECT_SCHEMA_VERSION,
  createdAt: now,
  updatedAt: now,
  lastRecoveryAt: now,
  project: normalizeProject(project),
  recoveryVersions: [],
});

export const loadProjectLibrary = (storage: StorageLike = window.localStorage): ProjectLibrary => {
  const hasExistingLibrary = storage.getItem(PROJECT_LIBRARY_KEY) !== null;
  const library = readLibrary(storage);
  if (hasExistingLibrary || library.projects.length) return library;

  const legacy = storage.getItem(LEGACY_PROJECT_KEY);
  let initialProject = clone(sampleProject);
  if (legacy) {
    try {
      initialProject = normalizeProject(JSON.parse(legacy));
    } catch {
      initialProject = clone(sampleProject);
    }
  }

  const record = createRecord(initialProject);
  const migrated = {...emptyLibrary(), projects: [record]};
  writeLibrary(storage, migrated);
  if (legacy) storage.removeItem(LEGACY_PROJECT_KEY);
  return migrated;
};

export const createStoredProject = (project: EditorProject, storage: StorageLike = window.localStorage): StoredProject => {
  const library = loadProjectLibrary(storage);
  const record = createRecord(project);
  library.projects.unshift(record);
  library.activeProjectId = record.id;
  writeLibrary(storage, library);
  return clone(record);
};

export const getStoredProject = (projectId: string, storage: StorageLike = window.localStorage): StoredProject | null => {
  const record = loadProjectLibrary(storage).projects.find((item) => item.id === projectId);
  return record ? clone(record) : null;
};

export const saveStoredProject = (
  projectId: string,
  project: EditorProject,
  options: {manual?: boolean; now?: number} = {},
  storage: StorageLike = window.localStorage,
) => {
  const library = loadProjectLibrary(storage);
  const record = library.projects.find((item) => item.id === projectId);
  if (!record) throw new Error("Project no longer exists");
  const now = options.now ?? Date.now();
  const normalized = normalizeProject(project);
  const changed = JSON.stringify(record.project) !== JSON.stringify(normalized);
  if (!changed && !options.manual) return clone(record);
  const shouldSnapshot = changed && (options.manual || now - record.lastRecoveryAt >= RECOVERY_INTERVAL_MS);
  if (shouldSnapshot) {
    record.recoveryVersions = [
      {id: createId(), savedAt: record.updatedAt, project: clone(record.project)},
      ...record.recoveryVersions,
    ].slice(0, MAX_RECOVERY_VERSIONS);
    record.lastRecoveryAt = now;
  }
  record.project = normalized;
  record.updatedAt = now;
  library.activeProjectId = projectId;
  writeLibrary(storage, library);
  return clone(record);
};

export const renameStoredProject = (projectId: string, name: string, storage: StorageLike = window.localStorage) => {
  const record = getStoredProject(projectId, storage);
  if (!record) throw new Error("Project no longer exists");
  record.project.name = name.trim() || record.project.name;
  return saveStoredProject(projectId, record.project, {manual: true}, storage);
};

export const duplicateStoredProject = (projectId: string, storage: StorageLike = window.localStorage) => {
  const source = getStoredProject(projectId, storage);
  if (!source) throw new Error("Project no longer exists");
  const project = clone(source.project);
  project.name = `${project.name} Copy`;
  return createStoredProject(project, storage);
};

export const deleteStoredProject = (projectId: string, storage: StorageLike = window.localStorage) => {
  const library = loadProjectLibrary(storage);
  library.projects = library.projects.filter((item) => item.id !== projectId);
  if (library.activeProjectId === projectId) library.activeProjectId = null;
  writeLibrary(storage, library);
};

export const restoreRecoveryVersion = (projectId: string, versionId: string, storage: StorageLike = window.localStorage) => {
  const library = loadProjectLibrary(storage);
  const record = library.projects.find((item) => item.id === projectId);
  const version = record?.recoveryVersions.find((item) => item.id === versionId);
  if (!record || !version) throw new Error("Recovery version is no longer available");
  const current = clone(record.project);
  record.project = normalizeProject(version.project);
  record.project.name = current.name;
  record.updatedAt = Date.now();
  record.recoveryVersions = [
    {id: createId(), savedAt: Date.now(), project: current},
    ...record.recoveryVersions.filter((item) => item.id !== versionId),
  ].slice(0, MAX_RECOVERY_VERSIONS);
  writeLibrary(storage, library);
  return clone(record);
};

export const importProjectValue = (value: unknown): EditorProject => {
  if (value && typeof value === "object" && "application" in value && "project" in value) {
    return normalizeProject((value as Partial<DirectorsCutProjectFile>).project);
  }
  return normalizeProject(value);
};

export const createProjectFile = (project: EditorProject): DirectorsCutProjectFile => ({
  application: "Directors Cut Pro",
  schemaVersion: PROJECT_SCHEMA_VERSION,
  exportedAt: new Date().toISOString(),
  project: normalizeProject(project),
});
