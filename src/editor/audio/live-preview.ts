import type {EditorProject} from "../types";
import type {AudioProcessor} from "./model";

const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
let context: AudioContext | null = null;
let activeNodes: AudioNode[] = [];

const connectProcessors = (audioContext: AudioContext, input: AudioNode, processors: readonly AudioProcessor[]) => {
  let current = input;
  const nodes: AudioNode[] = [];
  const append = <T extends AudioNode>(node: T) => { current.connect(node); current = node; nodes.push(node); };
  for (const processor of processors) {
    if (!processor.enabled) continue;
    if (processor.type === "eq") {
      for (const band of processor.bands) {
        if (!band.enabled) continue;
        const node = audioContext.createBiquadFilter();
        node.type = ({"bell": "peaking", "high-pass": "highpass", "low-pass": "lowpass", "low-shelf": "lowshelf", "high-shelf": "highshelf"} as const)[band.type];
        node.frequency.value = band.frequency;
        node.gain.value = band.gainDb;
        node.Q.value = band.q;
        append(node);
      }
    } else {
      const node = audioContext.createDynamicsCompressor();
      if (processor.type === "compressor") {
        node.threshold.value = processor.thresholdDb;
        node.ratio.value = processor.ratio;
        node.attack.value = processor.attackMs / 1000;
        node.release.value = processor.releaseMs / 1000;
        node.knee.value = processor.kneeDb;
      } else if (processor.type === "limiter") {
        node.threshold.value = processor.ceilingDb;
        node.ratio.value = 20;
        node.attack.value = processor.attackMs / 1000;
        node.release.value = processor.releaseMs / 1000;
        node.knee.value = 0;
      } else {
        node.threshold.value = processor.thresholdDb;
        node.ratio.value = 20;
        node.attack.value = processor.attackMs / 1000;
        node.release.value = processor.releaseMs / 1000;
        node.knee.value = 0;
      }
      append(node);
      if (processor.type === "compressor" && processor.makeupDb !== 0) {
        const makeup = audioContext.createGain();
        makeup.gain.value = 10 ** (processor.makeupDb / 20);
        append(makeup);
      }
    }
  }
  return {output: current, nodes};
};

export const connectLiveAudioPreview = async (root: HTMLElement, project: EditorProject) => {
  const AudioContextClass = globalThis.AudioContext;
  if (!AudioContextClass) return {connected: 0, errors: ["Web Audio is unavailable"]};
  context ??= new AudioContextClass({sampleRate: project.audioSettings?.sampleRate ?? 48_000});
  if (context.state === "suspended") await context.resume();
  const errors: string[] = [];
  let connected = 0;
  for (const node of activeNodes) node.disconnect();
  activeNodes = [];
  const audioContext = context;
  const makeChannel = (processors: readonly AudioProcessor[], pan: number, gain: number, muted: boolean) => {
    const input = audioContext.createGain();
    const chain = connectProcessors(audioContext, input, processors);
    const panner = audioContext.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    chain.output.connect(panner);
    const output = audioContext.createGain();
    output.gain.value = muted ? 0 : gain;
    panner.connect(output);
    activeNodes.push(input, ...chain.nodes, panner, output);
    return {input, output};
  };
  const settings = project.audioSettings;
  const buses = new Map((settings?.buses ?? []).map((bus) => [bus.id, makeChannel(bus.processors, bus.pan, 10 ** (bus.gainDb / 20), bus.muted)]));
  const masterId = settings?.masterBusId;
  for (const bus of settings?.buses ?? []) {
    const channel = buses.get(bus.id)!;
    if (bus.id === masterId || !bus.outputBusId || !buses.has(bus.outputBusId)) channel.output.connect(audioContext.destination);
    else channel.output.connect(buses.get(bus.outputBusId)!.input);
  }
  const soloActive = project.tracks.some((track) => track.kind === "audio" && track.solo);
  const tracks = new Map(project.tracks.map((track) => {
    const muted = track.muted || (soloActive && track.kind === "audio" && !track.solo);
    const channel = makeChannel(track.audioProcessors ?? [], track.audioPan ?? 0, 1, muted);
    channel.output.connect(buses.get(track.audioBusId ?? masterId ?? "")?.input ?? audioContext.destination);
    return [track.id, channel] as const;
  }));
  for (const media of root.querySelectorAll<HTMLMediaElement>("[data-editor-clip-id] video, [data-editor-clip-id] audio")) {
    const wrapper = media.closest<HTMLElement>("[data-editor-clip-id]");
    const clip = project.clips.find((item) => item.id === wrapper?.dataset.editorClipId);
    const track = project.tracks.find((item) => item.id === clip?.trackId);
    if (!clip || !track) continue;
    try {
      let source = sources.get(media);
      if (!source) {
        source = audioContext.createMediaElementSource(media);
        sources.set(media, source);
      }
      source.disconnect();
      const clipChannel = makeChannel(clip.audioProcessors ?? [], clip.audioPan ?? 0, 1, clip.audioMuted);
      source.connect(clipChannel.input);
      clipChannel.output.connect(tracks.get(track.id)?.input ?? audioContext.destination);
      connected++;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Could not connect preview audio");
    }
  }
  return {connected, errors};
};

export const observeLiveAudioPreview = (root: HTMLElement, project: EditorProject, onError: (message: string) => void) => {
  let timer: number | undefined;
  const connect = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => void connectLiveAudioPreview(root, project).then((result) => {
      if (result.errors.length) onError(result.errors[0]);
    }), 40);
  };
  const observer = new MutationObserver(connect);
  observer.observe(root, {childList: true, subtree: true});
  connect();
  return () => { observer.disconnect(); if (timer) window.clearTimeout(timer); };
};
