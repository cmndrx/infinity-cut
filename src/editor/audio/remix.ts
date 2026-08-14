export type RemixBeat = {frame: number; strength: number; section?: string};
export type RemixAnalysis = {durationInFrames: number; beats: RemixBeat[]; version: 1};
export type RemixSegment = {
  sourceStartFrame: number;
  sourceDurationInFrames: number;
  timelineStartFrame: number;
  durationInFrames: number;
  crossfadeInFrames: number;
};
export type RemixPlan = {
  version: 1;
  seed: string;
  sourceDurationInFrames: number;
  targetDurationInFrames: number;
  crossfadeInFrames: number;
  segments: RemixSegment[];
};
export type RemixOptions = {targetDurationInFrames: number; crossfadeInFrames?: number; minSegmentInFrames?: number; seed?: string};

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const randomGenerator = (seed: string) => {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const normalizeAnalysis = (analysis: RemixAnalysis) => {
  if (!analysis || analysis.version !== 1 || !Number.isInteger(analysis.durationInFrames) || analysis.durationInFrames < 1 || !Array.isArray(analysis.beats)) {
    throw new Error("Invalid Remix analysis");
  }
  const beats = analysis.beats
    .filter((beat) => beat && Number.isInteger(beat.frame) && beat.frame > 0 && beat.frame < analysis.durationInFrames && Number.isFinite(beat.strength))
    .map((beat) => ({...beat, strength: Math.max(0, Math.min(1, beat.strength))}))
    .sort((left, right) => left.frame - right.frame)
    .filter((beat, index, all) => index === 0 || beat.frame !== all[index - 1].frame);
  return {...analysis, beats};
};

type Candidate = {start: number; duration: number; score: number; section?: string};

const candidatesFromAnalysis = (analysis: RemixAnalysis, minDuration: number) => {
  const points = [0, ...analysis.beats.map((beat) => beat.frame), analysis.durationInFrames];
  const candidates: Candidate[] = [];
  let startIndex = 0;
  while (startIndex < points.length - 1) {
    let endIndex = startIndex + 1;
    while (endIndex < points.length - 1 && points[endIndex] - points[startIndex] < minDuration) endIndex++;
    const start = points[startIndex];
    const end = points[endIndex];
    const included = analysis.beats.filter((beat) => beat.frame >= start && beat.frame < end);
    const score = included.length ? included.reduce((total, beat) => total + beat.strength, 0) / included.length : 0.5;
    candidates.push({start, duration: end - start, score, section: included.find((beat) => beat.section)?.section});
    startIndex = endIndex;
  }
  return candidates.filter((candidate) => candidate.duration > 0);
};

export const createRemixPlan = (rawAnalysis: RemixAnalysis, options: RemixOptions): RemixPlan => {
  const analysis = normalizeAnalysis(rawAnalysis);
  const target = Math.round(options.targetDurationInFrames);
  if (!Number.isInteger(target) || target < 1) throw new Error("Remix target duration must be a positive frame count");
  const requestedCrossfade = Math.max(0, Math.round(options.crossfadeInFrames ?? 6));
  const minDuration = Math.max(requestedCrossfade * 2 + 1, Math.round(options.minSegmentInFrames ?? 24));
  const seed = options.seed ?? "directors-cut-remix";
  if (!seed || seed.length > 256) throw new Error("Remix seed must contain between 1 and 256 characters");
  const candidates = candidatesFromAnalysis(analysis, minDuration);
  if (!candidates.length) candidates.push({start: 0, duration: analysis.durationInFrames, score: 0.5});
  const random = randomGenerator(`${seed}:${analysis.durationInFrames}:${target}`);
  const segments: RemixSegment[] = [];
  let timelineEnd = 0;
  let previous: Candidate | undefined;

  while (timelineEnd < target) {
    const remaining = target - timelineEnd;
    const choices = candidates.map((candidate, index) => {
      const repeatPenalty = previous && candidate.start === previous.start ? 0.35 : 1;
      const sectionBonus = previous?.section && candidate.section && previous.section !== candidate.section ? 1.08 : 1;
      return {candidate, index, rank: candidate.score * repeatPenalty * sectionBonus + random() * 0.2};
    }).sort((left, right) => right.rank - left.rank || left.index - right.index);
    const chosen = choices[0].candidate;
    const maxCrossfade = segments.length ? Math.min(requestedCrossfade, Math.floor(chosen.duration / 2), Math.floor(segments[segments.length - 1].durationInFrames / 2)) : 0;
    const neededSourceDuration = remaining + maxCrossfade;
    const duration = Math.min(chosen.duration, neededSourceDuration);
    const crossfade = Math.min(maxCrossfade, Math.max(0, duration - 1));
    const start = segments.length ? timelineEnd - crossfade : 0;
    segments.push({
      sourceStartFrame: chosen.start,
      sourceDurationInFrames: duration,
      timelineStartFrame: start,
      durationInFrames: duration,
      crossfadeInFrames: crossfade,
    });
    timelineEnd = start + duration;
    previous = chosen;
    if (segments.length > Math.ceil(target / Math.max(1, minDuration - requestedCrossfade)) + candidates.length + 4) throw new Error("Unable to resolve Remix duration");
  }

  if (timelineEnd !== target) {
    const last = segments[segments.length - 1];
    const adjustment = timelineEnd - target;
    last.durationInFrames -= adjustment;
    last.sourceDurationInFrames -= adjustment;
  }
  return {version: 1, seed, sourceDurationInFrames: analysis.durationInFrames, targetDurationInFrames: target, crossfadeInFrames: requestedCrossfade, segments};
};

export const validateRemixPlan = (plan: RemixPlan) => {
  if (!plan || plan.version !== 1 || !Number.isInteger(plan.sourceDurationInFrames) || plan.sourceDurationInFrames < 1
    || !Number.isInteger(plan.targetDurationInFrames) || plan.targetDurationInFrames < 1 || !Array.isArray(plan.segments) || !plan.segments.length) return false;
  let end = 0;
  for (let index = 0; index < plan.segments.length; index++) {
    const segment = plan.segments[index];
    if (!Number.isInteger(segment.sourceStartFrame) || !Number.isInteger(segment.sourceDurationInFrames) || !Number.isInteger(segment.timelineStartFrame)
      || !Number.isInteger(segment.durationInFrames) || !Number.isInteger(segment.crossfadeInFrames) || segment.sourceStartFrame < 0
      || segment.sourceDurationInFrames < 1 || segment.durationInFrames < 1 || segment.sourceStartFrame + segment.sourceDurationInFrames > plan.sourceDurationInFrames
      || segment.sourceDurationInFrames !== segment.durationInFrames || segment.crossfadeInFrames < 0 || segment.crossfadeInFrames >= segment.durationInFrames
      || segment.timelineStartFrame !== (index === 0 ? 0 : end - segment.crossfadeInFrames)) return false;
    end = segment.timelineStartFrame + segment.durationInFrames;
  }
  return end === plan.targetDurationInFrames;
};
