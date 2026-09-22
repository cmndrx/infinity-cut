import {spawn} from "node:child_process";

/** A successfully probed silent video is different from unreadable media. */
export const hasAudioStream = (source: string, signal: AbortSignal): Promise<boolean> => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new Error("Export cancelled")); return; }
  const child = spawn("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", source], {stdio: ["ignore", "pipe", "pipe"]});
  let output = "";
  let diagnostics = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { diagnostics = `${diagnostics}${String(chunk)}`.slice(-2000); });
  const abort = () => { child.kill("SIGTERM"); };
  const timeout = setTimeout(() => { child.kill("SIGKILL"); }, 30_000);
  const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); };
  signal.addEventListener("abort", abort, {once: true});
  child.once("error", (error) => { cleanup(); reject(new Error(`Could not inspect media audio: ${error.message}`)); });
  child.once("close", (code) => {
    cleanup();
    if (signal.aborted) reject(new Error("Export cancelled"));
    else if (code !== 0) reject(new Error(`Could not inspect media audio. Relink the source and retry. ${diagnostics.trim()}`));
    else resolve(Boolean(output.trim()));
  });
});
