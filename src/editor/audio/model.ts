export type EqBandType = "high-pass" | "low-shelf" | "bell" | "high-shelf" | "low-pass";

export type EqBand = {
  id: string;
  enabled: boolean;
  type: EqBandType;
  frequency: number;
  gainDb: number;
  q: number;
};

export type AudioProcessor =
  | {id: string; type: "eq"; enabled: boolean; bands: EqBand[]}
  | {id: string; type: "compressor"; enabled: boolean; thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; kneeDb: number; makeupDb: number}
  | {id: string; type: "limiter"; enabled: boolean; ceilingDb: number; attackMs: number; releaseMs: number}
  | {id: string; type: "noise-gate"; enabled: boolean; thresholdDb: number; rangeDb: number; attackMs: number; releaseMs: number};

export type AudioClipMix = {
  id: string;
  inputIndex: number;
  audioStreamIndex?: number;
  trackId: string;
  startFrame: number;
  durationFrames: number;
  sourceStartFrame: number;
  playbackRate: number;
  preservePitch?: boolean;
  volumeKeyframes?: {frame: number; value: number; easing: "linear" | "ease-in-out"}[];
  gainDb: number;
  pan: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  muted: boolean;
  processors: AudioProcessor[];
};

export type AudioTrackMix = {
  id: string;
  busId: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  processors: AudioProcessor[];
};

export type AudioBus = {
  id: string;
  name: string;
  outputBusId: string | null;
  gainDb: number;
  pan: number;
  muted: boolean;
  processors: AudioProcessor[];
};

export type AudioMix = {
  fps: number;
  durationInFrames: number;
  sampleRate: number;
  masterBusId: string;
  clips: AudioClipMix[];
  tracks: AudioTrackMix[];
  buses: AudioBus[];
};

export type AudioModelIssue = {path: string; message: string};
export type AudioModelValidation = {valid: boolean; issues: AudioModelIssue[]};

const finiteBetween = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);

const validateProcessors = (processors: AudioProcessor[], path: string, issues: AudioModelIssue[]) => {
  if (!Array.isArray(processors) || processors.length > 32) {
    issues.push({path, message: "Processor chains must contain at most 32 processors"});
    return;
  }
  const ids = new Set<string>();
  processors.forEach((processor, index) => {
    const itemPath = `${path}.${index}`;
    if (!processor || typeof processor !== "object" || !validId(processor.id) || ids.has(processor.id)) {
      issues.push({path: itemPath, message: "Processor id is missing or duplicated"});
      return;
    }
    ids.add(processor.id);
    if (typeof processor.enabled !== "boolean") issues.push({path: `${itemPath}.enabled`, message: "Enabled must be boolean"});
    if (processor.type === "eq") {
      if (!Array.isArray(processor.bands) || processor.bands.length > 12) {
        issues.push({path: `${itemPath}.bands`, message: "EQ supports at most 12 bands"});
        return;
      }
      const bandIds = new Set<string>();
      processor.bands.forEach((band, bandIndex) => {
        const bandPath = `${itemPath}.bands.${bandIndex}`;
        if (!validId(band.id) || bandIds.has(band.id)) issues.push({path: `${bandPath}.id`, message: "EQ band id is missing or duplicated"});
        bandIds.add(band.id);
        if (!["high-pass", "low-shelf", "bell", "high-shelf", "low-pass"].includes(band.type)) issues.push({path: `${bandPath}.type`, message: "Unknown EQ band type"});
        if (!finiteBetween(band.frequency, 20, 20_000)) issues.push({path: `${bandPath}.frequency`, message: "Frequency must be between 20 and 20000 Hz"});
        if (!finiteBetween(band.gainDb, -24, 24)) issues.push({path: `${bandPath}.gainDb`, message: "EQ gain must be between -24 and 24 dB"});
        if (!finiteBetween(band.q, 0.1, 20)) issues.push({path: `${bandPath}.q`, message: "EQ Q must be between 0.1 and 20"});
      });
    } else if (processor.type === "compressor") {
      if (!finiteBetween(processor.thresholdDb, -80, 0) || !finiteBetween(processor.ratio, 1, 30) || !finiteBetween(processor.attackMs, 0.1, 2_000)
        || !finiteBetween(processor.releaseMs, 1, 10_000) || !finiteBetween(processor.kneeDb, 0, 40) || !finiteBetween(processor.makeupDb, -24, 24)) {
        issues.push({path: itemPath, message: "Compressor parameters are outside supported ranges"});
      }
    } else if (processor.type === "limiter") {
      if (!finiteBetween(processor.ceilingDb, -24, 0) || !finiteBetween(processor.attackMs, 0.1, 100) || !finiteBetween(processor.releaseMs, 1, 5_000)) {
        issues.push({path: itemPath, message: "Limiter parameters are outside supported ranges"});
      }
    } else if (processor.type === "noise-gate") {
      if (!finiteBetween(processor.thresholdDb, -100, 0) || !finiteBetween(processor.rangeDb, -100, 0) || !finiteBetween(processor.attackMs, 0.1, 2_000)
        || !finiteBetween(processor.releaseMs, 1, 10_000)) {
        issues.push({path: itemPath, message: "Noise gate parameters are outside supported ranges"});
      }
    } else {
      issues.push({path: `${itemPath}.type`, message: "Unknown audio processor"});
    }
  });
};

export const validateAudioProcessorChain = (processors: AudioProcessor[]): AudioModelValidation => {
  const issues: AudioModelIssue[] = [];
  validateProcessors(processors, "processors", issues);
  return {valid: issues.length === 0, issues};
};

export const validateAudioMix = (mix: AudioMix): AudioModelValidation => {
  const issues: AudioModelIssue[] = [];
  if (!mix || typeof mix !== "object") return {valid: false, issues: [{path: "mix", message: "Audio mix is required"}]};
  if (!finiteBetween(mix.fps, 1, 240)) issues.push({path: "fps", message: "FPS must be between 1 and 240"});
  if (!Number.isInteger(mix.durationInFrames) || mix.durationInFrames < 1) issues.push({path: "durationInFrames", message: "Duration must be a positive frame count"});
  if (!Number.isInteger(mix.sampleRate) || mix.sampleRate < 8_000 || mix.sampleRate > 192_000) issues.push({path: "sampleRate", message: "Sample rate must be between 8000 and 192000 Hz"});
  if (!Array.isArray(mix.clips) || !Array.isArray(mix.tracks) || !Array.isArray(mix.buses)) return {valid: false, issues: [...issues, {path: "mix", message: "Clips, tracks, and buses must be arrays"}]};

  const busIds = new Set<string>();
  mix.buses.forEach((bus, index) => {
    const path = `buses.${index}`;
    if (!validId(bus.id) || busIds.has(bus.id)) issues.push({path: `${path}.id`, message: "Bus id is missing or duplicated"});
    busIds.add(bus.id);
    if (!finiteBetween(bus.gainDb, -100, 24) || !finiteBetween(bus.pan, -1, 1) || typeof bus.muted !== "boolean") issues.push({path, message: "Bus gain, pan, or mute state is invalid"});
    validateProcessors(bus.processors, `${path}.processors`, issues);
  });
  if (!validId(mix.masterBusId) || !busIds.has(mix.masterBusId)) issues.push({path: "masterBusId", message: "Master bus does not exist"});
  const master = mix.buses.find((bus) => bus.id === mix.masterBusId);
  if (master?.outputBusId !== null) issues.push({path: "masterBusId", message: "Master bus cannot route to another bus"});
  mix.buses.forEach((bus, index) => {
    if (bus.id !== mix.masterBusId && (!bus.outputBusId || !busIds.has(bus.outputBusId))) issues.push({path: `buses.${index}.outputBusId`, message: "Bus output does not exist"});
  });

  for (const bus of mix.buses) {
    const seen = new Set<string>();
    let current: AudioBus | undefined = bus;
    while (current?.outputBusId) {
      if (seen.has(current.id)) {
        issues.push({path: `buses.${bus.id}.outputBusId`, message: "Bus routing contains a cycle"});
        break;
      }
      seen.add(current.id);
      current = mix.buses.find((candidate) => candidate.id === current?.outputBusId);
    }
  }

  const trackIds = new Set<string>();
  mix.tracks.forEach((track, index) => {
    const path = `tracks.${index}`;
    if (!validId(track.id) || trackIds.has(track.id)) issues.push({path: `${path}.id`, message: "Track id is missing or duplicated"});
    trackIds.add(track.id);
    if (!busIds.has(track.busId)) issues.push({path: `${path}.busId`, message: "Track destination bus does not exist"});
    if (!finiteBetween(track.gainDb, -100, 24) || !finiteBetween(track.pan, -1, 1) || typeof track.muted !== "boolean" || typeof track.solo !== "boolean") issues.push({path, message: "Track gain, pan, mute, or solo state is invalid"});
    validateProcessors(track.processors, `${path}.processors`, issues);
  });

  const clipIds = new Set<string>();
  mix.clips.forEach((clip, index) => {
    const path = `clips.${index}`;
    if (!validId(clip.id) || clipIds.has(clip.id)) issues.push({path: `${path}.id`, message: "Clip id is missing or duplicated"});
    clipIds.add(clip.id);
    if (!trackIds.has(clip.trackId)) issues.push({path: `${path}.trackId`, message: "Clip track does not exist"});
    if (!Number.isInteger(clip.inputIndex) || clip.inputIndex < 0 || !Number.isInteger(clip.startFrame) || clip.startFrame < 0 || !Number.isInteger(clip.durationFrames)
      || clip.durationFrames < 1 || clip.startFrame + clip.durationFrames > mix.durationInFrames || !Number.isFinite(clip.sourceStartFrame) || clip.sourceStartFrame < 0
      || !finiteBetween(clip.playbackRate, 0.1, 10) || !finiteBetween(clip.gainDb, -100, 24) || !finiteBetween(clip.pan, -1, 1)
      || !Number.isInteger(clip.fadeInFrames) || !Number.isInteger(clip.fadeOutFrames) || clip.fadeInFrames < 0 || clip.fadeOutFrames < 0
      || clip.fadeInFrames + clip.fadeOutFrames > clip.durationFrames || typeof clip.muted !== "boolean") issues.push({path, message: "Clip timing or mix state is invalid"});
    if (clip.audioStreamIndex !== undefined && (!Number.isInteger(clip.audioStreamIndex) || clip.audioStreamIndex < 0)) issues.push({path: `${path}.audioStreamIndex`, message: "Audio stream index must be a non-negative integer"});
    validateProcessors(clip.processors, `${path}.processors`, issues);
    if (clip.preservePitch !== undefined && typeof clip.preservePitch !== "boolean") issues.push({path, message: "Invalid pitch preservation setting"});
    if (clip.volumeKeyframes !== undefined && (!Array.isArray(clip.volumeKeyframes) || clip.volumeKeyframes.some((key) => !Number.isFinite(key.frame) || key.frame < 0 || !finiteBetween(key.value, 0, 16) || !["linear", "ease-in-out"].includes(key.easing)))) issues.push({path, message: "Invalid volume automation"});
  });
  return {valid: issues.length === 0, issues};
};

export const assertValidAudioMix = (mix: AudioMix) => {
  const validation = validateAudioMix(mix);
  if (!validation.valid) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
};
