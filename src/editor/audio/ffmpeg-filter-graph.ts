import {assertValidAudioMix, type AudioMix, type AudioProcessor} from "./model";

export type FfmpegAudioGraph = {filterComplex: string; outputLabel: string};

const decimal = (value: number) => {
  const rounded = Math.abs(value) < 0.0000005 ? 0 : Math.round(value * 1_000_000) / 1_000_000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
};
const seconds = (frames: number, fps: number) => decimal(frames / fps);
const linearGain = (db: number) => decimal(10 ** (db / 20));

const atempo = (rate: number) => {
  const factors: number[] = [];
  let remaining = rate;
  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  factors.push(remaining);
  return factors.map((factor) => `atempo=${decimal(factor)}`);
};

const panFilter = (pan: number) => {
  const left = pan <= 0 ? 1 : Math.cos((pan * Math.PI) / 2);
  const right = pan >= 0 ? 1 : Math.cos((-pan * Math.PI) / 2);
  return `pan=stereo|c0=${decimal(left)}*c0|c1=${decimal(right)}*c1`;
};

const processorFilters = (processor: AudioProcessor): string[] => {
  if (!processor.enabled) return [];
  if (processor.type === "eq") return processor.bands.flatMap((band) => {
    if (!band.enabled) return [];
    if (band.type === "high-pass") return [`highpass=f=${decimal(band.frequency)}:p=2`];
    if (band.type === "low-pass") return [`lowpass=f=${decimal(band.frequency)}:p=2`];
    const width = `t=q:w=${decimal(band.q)}`;
    if (band.type === "low-shelf") return [`bass=f=${decimal(band.frequency)}:${width}:g=${decimal(band.gainDb)}`];
    if (band.type === "high-shelf") return [`treble=f=${decimal(band.frequency)}:${width}:g=${decimal(band.gainDb)}`];
    return [`equalizer=f=${decimal(band.frequency)}:${width}:g=${decimal(band.gainDb)}`];
  });
  if (processor.type === "compressor") return [`acompressor=threshold=${decimal(processor.thresholdDb)}dB:ratio=${decimal(processor.ratio)}:attack=${decimal(processor.attackMs)}:release=${decimal(processor.releaseMs)}:knee=${decimal(processor.kneeDb)}dB:makeup=${decimal(processor.makeupDb)}dB`];
  if (processor.type === "limiter") return [`alimiter=limit=${linearGain(processor.ceilingDb)}:attack=${decimal(processor.attackMs)}:release=${decimal(processor.releaseMs)}:level=0`];
  return [`agate=threshold=${decimal(processor.thresholdDb)}dB:range=${linearGain(processor.rangeDb)}:attack=${decimal(processor.attackMs)}:release=${decimal(processor.releaseMs)}`];
};

const channelFilters = (gainDb: number, pan: number, muted: boolean, processors: AudioProcessor[]) => [
  ...processors.flatMap(processorFilters),
  `volume=${muted ? "0" : linearGain(gainDb)}`,
  panFilter(pan),
];

const mixTo = (inputs: string[], output: string, duration: string, sampleRate: number) => inputs.length
  ? `${inputs.map((label) => `[${label}]`).join("")}amix=inputs=${inputs.length}:duration=longest:normalize=0,atrim=duration=${duration},aresample=${sampleRate}[${output}]`
  : `anullsrc=r=${sampleRate}:cl=stereo,atrim=duration=${duration}[${output}]`;

export const buildFfmpegAudioGraph = (mix: AudioMix): FfmpegAudioGraph => {
  assertValidAudioMix(mix);
  const graph: string[] = [];
  const duration = seconds(mix.durationInFrames, mix.fps);
  const audibleSoloTrackIds = new Set(mix.tracks.filter((track) => track.solo).map((track) => track.id));
  const soloActive = audibleSoloTrackIds.size > 0;

  for (const clip of mix.clips) {
    const input = `${clip.inputIndex}:a:${clip.audioStreamIndex ?? 0}`;
    const output = `dc_clip_${clip.id}`;
    const filters = [
      `atrim=start=${seconds(clip.sourceStartFrame, mix.fps)}:duration=${seconds(clip.durationFrames * clip.playbackRate, mix.fps)}`,
      "asetpts=PTS-STARTPTS",
      ...atempo(clip.playbackRate),
    ];
    if (clip.fadeInFrames) filters.push(`afade=t=in:st=0:d=${seconds(clip.fadeInFrames, mix.fps)}:curve=qsin`);
    if (clip.fadeOutFrames) filters.push(`afade=t=out:st=${seconds(clip.durationFrames - clip.fadeOutFrames, mix.fps)}:d=${seconds(clip.fadeOutFrames, mix.fps)}:curve=qsin`);
    filters.push(...channelFilters(clip.gainDb, clip.pan, clip.muted, clip.processors));
    filters.push(`adelay=${decimal((clip.startFrame / mix.fps) * 1000)}|${decimal((clip.startFrame / mix.fps) * 1000)}`);
    graph.push(`[${input}]${filters.join(",")}[${output}]`);
  }

  for (const track of mix.tracks) {
    const mixed = `dc_track_mix_${track.id}`;
    const clipLabels = mix.clips.filter((clip) => clip.trackId === track.id).map((clip) => `dc_clip_${clip.id}`);
    graph.push(mixTo(clipLabels, mixed, duration, mix.sampleRate));
    const output = `dc_track_${track.id}`;
    const muted = track.muted || (soloActive && !audibleSoloTrackIds.has(track.id));
    graph.push(`[${mixed}]${channelFilters(track.gainDb, track.pan, muted, track.processors).join(",")}[${output}]`);
  }

  const completed = new Set<string>();
  while (completed.size < mix.buses.length) {
    let progressed = false;
    for (const bus of mix.buses) {
      if (completed.has(bus.id)) continue;
      const childBuses = mix.buses.filter((candidate) => candidate.outputBusId === bus.id);
      if (childBuses.some((candidate) => !completed.has(candidate.id))) continue;
      const inputs = [
        ...mix.tracks.filter((track) => track.busId === bus.id).map((track) => `dc_track_${track.id}`),
        ...childBuses.map((candidate) => `dc_bus_${candidate.id}`),
      ];
      const mixed = `dc_bus_mix_${bus.id}`;
      graph.push(mixTo(inputs, mixed, duration, mix.sampleRate));
      graph.push(`[${mixed}]${channelFilters(bus.gainDb, bus.pan, bus.muted, bus.processors).join(",")}[dc_bus_${bus.id}]`);
      completed.add(bus.id);
      progressed = true;
    }
    if (!progressed) throw new Error("Unable to resolve bus routing");
  }

  return {filterComplex: graph.join(";"), outputLabel: `dc_bus_${mix.masterBusId}`};
};

export const audioProcessorToFfmpegFilters = processorFilters;
