import type {EditorProject, EditorTrack, ProjectAudioSettings} from "../types";
import {validateAudioMix, validateAudioProcessorChain, type AudioMix, type AudioProcessor} from "./model";

const clone = <T,>(value: T): T => structuredClone(value);
const clamp = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value)
  ? Math.min(max, Math.max(min, value))
  : fallback;

export const DEFAULT_AUDIO_PROJECT_SETTINGS: ProjectAudioSettings = {
  sampleRate: 48_000,
  masterBusId: "master",
  buses: [
    {id: "dialogue", name: "Dialogue", outputBusId: "master", gainDb: 0, pan: 0, muted: false, processors: []},
    {id: "music", name: "Music", outputBusId: "master", gainDb: 0, pan: 0, muted: false, processors: []},
    {id: "sfx", name: "SFX", outputBusId: "master", gainDb: 0, pan: 0, muted: false, processors: []},
    {id: "master", name: "Master", outputBusId: null, gainDb: 0, pan: 0, muted: false, processors: [
      {id: "master-limiter", type: "limiter", enabled: true, ceilingDb: -1, attackMs: 5, releaseMs: 80},
    ]},
  ],
};

export const normalizeProcessorChain = (value: unknown): AudioProcessor[] => {
  if (!Array.isArray(value)) return [];
  const candidate = value.slice(0, 32) as AudioProcessor[];
  return validateAudioProcessorChain(candidate).valid ? clone(candidate) : [];
};

export const normalizeTrackAudio = (track: EditorTrack, settings: ProjectAudioSettings): EditorTrack => ({
  ...track,
  audioPan: clamp(track.audioPan, 0, -1, 1),
  audioBusId: settings.buses.some((bus) => bus.id === track.audioBusId) ? track.audioBusId : settings.masterBusId,
  audioProcessors: normalizeProcessorChain(track.audioProcessors),
});

export const normalizeProjectAudioSettings = (value: unknown): ProjectAudioSettings => {
  if (!value || typeof value !== "object") return clone(DEFAULT_AUDIO_PROJECT_SETTINGS);
  const raw = value as Partial<ProjectAudioSettings>;
  if (!Array.isArray(raw.buses) || !raw.buses.length || typeof raw.masterBusId !== "string") return clone(DEFAULT_AUDIO_PROJECT_SETTINGS);
  const buses = raw.buses.slice(0, 32).flatMap((bus) => {
    if (!bus || typeof bus !== "object" || typeof bus.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(bus.id)) return [];
    return [{
      id: bus.id,
      name: typeof bus.name === "string" && bus.name.trim() ? bus.name.trim().slice(0, 80) : bus.id,
      outputBusId: typeof bus.outputBusId === "string" ? bus.outputBusId : null,
      gainDb: clamp(bus.gainDb, 0, -100, 24),
      pan: clamp(bus.pan, 0, -1, 1),
      muted: bus.muted === true,
      processors: normalizeProcessorChain(bus.processors),
    }];
  });
  if (!buses.some((bus) => bus.id === raw.masterBusId)) return clone(DEFAULT_AUDIO_PROJECT_SETTINGS);
  const masterBusId = raw.masterBusId;
  const ids = new Set(buses.map((bus) => bus.id));
  const routed = buses.map((bus) => ({...bus, outputBusId: bus.id === masterBusId ? null : bus.outputBusId && ids.has(bus.outputBusId) ? bus.outputBusId : masterBusId}));
  const probe: AudioMix = {fps: 30, durationInFrames: 1, sampleRate: Math.round(clamp(raw.sampleRate, 48_000, 8_000, 192_000)), masterBusId, buses: routed, tracks: [], clips: []};
  return validateAudioMix(probe).valid
    ? {sampleRate: probe.sampleRate, masterBusId, buses: routed}
    : clone(DEFAULT_AUDIO_PROJECT_SETTINGS);
};

const linearToDb = (gain: number) => gain <= 0 ? -100 : Math.max(-100, Math.min(24, 20 * Math.log10(gain)));

export type AudioInputBinding = {inputIndex: number; audioStreamIndex?: number};

/** Builds the single deterministic mix contract used by preview and final export. */
export const buildProjectAudioMix = (
  project: EditorProject,
  resolveInput: (clipId: string) => AudioInputBinding | undefined,
): AudioMix => {
  const settings = normalizeProjectAudioSettings(project.audioSettings);
  const tracks = project.tracks.filter((track) => track.kind === "audio" || project.clips.some((clip) => clip.trackId === track.id && clip.kind === "video"))
    .map((track) => normalizeTrackAudio(track, settings));
  const trackIds = new Set(tracks.map((track) => track.id));
  const mix: AudioMix = {
    fps: project.fps,
    durationInFrames: project.durationInFrames,
    sampleRate: settings.sampleRate,
    masterBusId: settings.masterBusId,
    buses: clone(settings.buses),
    tracks: tracks.map((track) => ({
      id: track.id,
      busId: track.audioBusId ?? settings.masterBusId,
      gainDb: linearToDb(track.volume),
      pan: track.audioPan ?? 0,
      muted: track.muted,
      solo: track.solo,
      processors: clone(track.audioProcessors ?? []),
    })),
    clips: project.clips.flatMap((clip) => {
      const input = resolveInput(clip.id);
      if (!input || !trackIds.has(clip.trackId) || !clip.src || (clip.kind !== "audio" && clip.kind !== "video")) return [];
      const durationFrames = Math.min(clip.duration, project.durationInFrames - clip.start);
      if (durationFrames < 1) return [];
      return [{
        id: clip.id,
        ...input,
        trackId: clip.trackId,
        startFrame: clip.start,
        durationFrames,
        sourceStartFrame: clip.sourceStart,
        playbackRate: clip.playbackRate ?? 1,
        gainDb: linearToDb(clip.volume),
        pan: clamp(clip.audioPan, 0, -1, 1),
        fadeInFrames: Math.min(durationFrames, Math.max(0, Math.round(clip.fadeIn))),
        fadeOutFrames: Math.min(durationFrames, Math.max(0, Math.round(clip.fadeOut))),
        muted: clip.audioMuted,
        processors: normalizeProcessorChain(clip.audioProcessors),
      }];
    }),
  };
  for (const clip of mix.clips) {
    if (clip.fadeInFrames + clip.fadeOutFrames > clip.durationFrames) clip.fadeOutFrames = Math.max(0, clip.durationFrames - clip.fadeInFrames);
  }
  return mix;
};
