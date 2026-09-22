import {afterEach, describe, expect, it, vi} from "vitest";
import {sampleProject} from "../project";
import {sequenceSnapshot} from "../sequences";

class Node {
  edges: Node[] = [];
  gain = {value: 1};
  pan = {value: 0};
  connect(target: Node) { this.edges.push(target); }
  disconnect() { this.edges = []; }
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("nested preview routing", () => {
  it("isolates repeated clip IDs and updates parent automation without rebuilding nodes", async () => {
    vi.resetModules();
    const nodes: Node[] = [];
    const sources = new Map<object, Node>();
    let tick: FrameRequestCallback = () => undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { tick = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("AudioContext", class {
      state = "running";
      destination = new Node();
      createGain() { const node = new Node(); nodes.push(node); return node; }
      createStereoPanner() { return this.createGain(); }
      createMediaElementSource(media: object) { const node = this.createGain(); sources.set(media, node); return node; }
    });
    const project = structuredClone(sampleProject);
    project.audioSettings = {sampleRate: 48000, masterBusId: "master", buses: [{id: "master", name: "Master", gainDb: 0, pan: 0, muted: false, outputBusId: null, processors: []}]};
    project.tracks = [{id: "a1", name: "A1", kind: "audio", volume: .5, muted: false, solo: false, hidden: false, locked: false}];
    project.clips = [{...project.clips.find((clip) => clip.kind === "audio")!, id: "duplicate", trackId: "a1", audioProcessors: []}];
    const child = sequenceSnapshot(project);
    child.id = "child";
    project.sequences = [child];
    project.clips = ["left", "right"].map((id) => ({...project.clips[0], id, kind: "sequence", nestedSequenceId: "child"}));
    const nests = ["left", "right"].map((id, index) => ({dataset: {audioNestId: id, audioGain: index ? ".8" : ".2"}, parentElement: {closest: () => null}}));
    const media = nests.map((nest) => ({closest: (selector: string) => selector === "[data-audio-nest-id]" ? nest : {dataset: {editorClipId: "duplicate"}}}));
    const root = {querySelectorAll: (selector: string) => selector === "[data-audio-nest-id]" ? nests : media} as unknown as HTMLElement;
    const {connectLiveAudioPreview, disconnectLiveAudioPreview} = await import("./live-preview");
    const result = await connectLiveAudioPreview(root, project);
    expect(result).toEqual({connected: 2, errors: []});
    const gainPath = (node: Node): number[] => [node.gain.value, ...node.edges.flatMap(gainPath)];
    expect(gainPath(sources.get(media[0])!)).toContain(.1);
    expect(gainPath(sources.get(media[0])!)).not.toContain(.4);
    expect(gainPath(sources.get(media[1])!)).toContain(.4);
    const nodeCount = nodes.length;
    nests[0].dataset.audioGain = ".4";
    tick(0);
    expect(gainPath(sources.get(media[0])!)).toContain(.2);
    expect(nodes.length).toBe(nodeCount);
    disconnectLiveAudioPreview();
    expect(nodes.every((node) => node.edges.length === 0 || sources.get(media[0]) === node || sources.get(media[1]) === node)).toBe(true);
  });
});
