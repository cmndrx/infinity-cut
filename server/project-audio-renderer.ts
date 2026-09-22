import {spawn} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import type {EditorProject} from "../src/editor/types";
import {projectViewForSequence} from "../src/editor/sequences";
import {buildProjectAudioMix} from "../src/editor/audio/project-audio";
import {buildFfmpegAudioGraph} from "../src/editor/audio/ffmpeg-filter-graph";
import {hasAudioStream} from "./audio-probe";

type Options = {
  project: EditorProject; output: string; frameRange: [number, number] | null;
  signal: AbortSignal; videoInput?: string;
  audioCodec: "aac" | "libopus" | "pcm_s16le" | "pcm_s24le";
};

export const assertSupportedNestedAudio = (project: EditorProject, ancestors: string[] = []): void => {
  if (ancestors.includes(project.activeSequenceId) || ancestors.length >= 16) throw new Error("Nested audio contains a cycle or exceeds 16 levels");
  for (const clip of project.clips) {
    if (clip.kind !== "sequence" || clip.start >= project.durationInFrames) continue;
    const nested = clip.nestedSequenceId ? projectViewForSequence(project, clip.nestedSequenceId) : null;
    if (!nested) throw new Error(`Missing nested sequence: ${clip.name}`);
    if (nested.fps !== project.fps || (clip.playbackRate ?? 1) !== 1) throw new Error(`Nested sequence "${clip.name}" requires matching frame rates and 100% speed until preview supports nested retiming`);
    assertSupportedNestedAudio(nested, [...ancestors, project.activeSequenceId]);
  }
};

const runFfmpeg = (args: string[], signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new Error("Export cancelled")); return; }
  const child = spawn("ffmpeg", args, {stdio: ["ignore", "ignore", "pipe"]});
  let stderr = "";
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-8000); });
  const abort = () => { child.kill("SIGTERM"); killTimer = setTimeout(() => child.kill("SIGKILL"), 2000); };
  const cleanup = () => { clearTimeout(killTimer); signal.removeEventListener("abort", abort); };
  signal.addEventListener("abort", abort, {once: true});
  child.once("error", (error) => { cleanup(); reject(error); });
  child.once("close", (code) => {
    cleanup();
    if (signal.aborted) reject(new Error("Export cancelled"));
    else if (code === 0) resolve();
    else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
  });
});

/** Render each nested mix before applying its parent clip and track processing. */
export const createProjectAudioRenderer = (resolveSource: (src: string) => string) => {
  const render = async (options: Options, ancestors: string[] = []): Promise<void> => {
    const {project, signal} = options;
    if (signal.aborted) throw new Error("Export cancelled");
    if (!ancestors.length) assertSupportedNestedAudio(project);
    if (ancestors.includes(project.activeSequenceId) || ancestors.length >= 16) throw new Error("Nested audio contains a cycle or exceeds 16 levels");
    const temporary = await mkdtemp(path.join(tmpdir(), "directors-nested-audio-"));
    try {
      const inputs: {id: string; source: string}[] = [];
      const nestedOutputs = new Map<string, string>();
      for (const clip of project.clips) {
        if (signal.aborted) throw new Error("Export cancelled");
        if (clip.start >= project.durationInFrames) continue;
        if (clip.kind === "sequence" && clip.nestedSequenceId) {
          const nested = projectViewForSequence(project, clip.nestedSequenceId);
          if (!nested) throw new Error(`Missing nested sequence: ${clip.name}`);
          if (nested.fps !== project.fps || (clip.playbackRate ?? 1) !== 1) throw new Error(`Nested sequence "${clip.name}" requires matching frame rates and 100% speed until preview supports nested retiming`);
          let source = nestedOutputs.get(clip.nestedSequenceId);
          if (!source) {
            source = path.join(temporary, `nested-${nestedOutputs.size}.wav`);
            await render({project: nested, output: source, frameRange: null, signal, audioCodec: "pcm_s24le"}, [...ancestors, project.activeSequenceId]);
            nestedOutputs.set(clip.nestedSequenceId, source);
          }
          inputs.push({id: clip.id, source});
        } else if ((clip.kind === "audio" || clip.kind === "video") && clip.src) {
          const source = resolveSource(clip.src);
          if (await hasAudioStream(source, signal)) inputs.push({id: clip.id, source});
        }
      }
      const offset = options.videoInput ? 1 : 0;
      const bindings = new Map(inputs.map((input, index) => [input.id, {inputIndex: index + offset}]));
      const graph = buildFfmpegAudioGraph(buildProjectAudioMix(project, (id) => bindings.get(id)));
      const args = ["-hide_banner", "-loglevel", "error", "-y"];
      if (options.videoInput) args.push("-i", options.videoInput);
      for (const input of inputs) args.push("-i", input.source);
      args.push("-filter_complex", graph.filterComplex);
      if (options.videoInput) args.push("-map", "0:v:0", "-c:v", "copy");
      args.push("-map", `[${graph.outputLabel}]`, "-c:a", options.audioCodec);
      if (options.audioCodec === "aac") args.push("-b:a", "320k");
      if (options.audioCodec === "libopus") args.push("-b:a", "256k");
      if (options.frameRange) args.push("-ss", String(options.frameRange[0] / project.fps), "-t", String((options.frameRange[1] - options.frameRange[0] + 1) / project.fps));
      args.push(options.output);
      await runFfmpeg(args, signal);
    } finally { await rm(temporary, {recursive: true, force: true}); }
  };
  return render;
};
