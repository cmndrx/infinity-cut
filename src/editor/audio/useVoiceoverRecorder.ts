import {useCallback, useEffect, useRef, useState} from "react";

export type VoiceoverStatus = "idle" | "requesting" | "recording" | "stopping" | "ready" | "error";
export type VoiceoverErrorCode = "unsupported" | "permission-denied" | "device-unavailable" | "device-lost" | "recording-failed";
export type VoiceoverError = {code: VoiceoverErrorCode; message: string};
export type VoiceoverRecording = {blob: Blob; mimeType: string; durationMs: number; createdAt: number};

export const selectVoiceoverMimeType = (Recorder: typeof MediaRecorder | undefined = globalThis.MediaRecorder) => {
  if (!Recorder) return "";
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => Recorder.isTypeSupported(type)) ?? "";
};

export const classifyVoiceoverError = (error: unknown): VoiceoverError => {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return {code: "permission-denied", message: "Microphone access was denied. Allow access in browser settings and try again."};
  if (["NotFoundError", "NotReadableError", "OverconstrainedError"].includes(name)) return {code: "device-unavailable", message: "No usable microphone is available."};
  return {code: "recording-failed", message: error instanceof Error ? error.message : "Voiceover recording failed."};
};

export type UseVoiceoverRecorderOptions = {onRecording?: (recording: VoiceoverRecording) => void; onError?: (error: VoiceoverError) => void};

export const useVoiceoverRecorder = ({onRecording, onError}: UseVoiceoverRecorderOptions = {}) => {
  const [status, setStatus] = useState<VoiceoverStatus>("idle");
  const [error, setError] = useState<VoiceoverError | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const requestRef = useRef(0);
  const discardRef = useRef(false);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const fail = useCallback((nextError: VoiceoverError) => {
    releaseStream();
    setError(nextError);
    setStatus("error");
    onError?.(nextError);
  }, [onError, releaseStream]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      fail({code: "unsupported", message: "This browser does not support microphone recording."});
      return;
    }
    const request = ++requestRef.current;
    discardRef.current = false;
    chunksRef.current = [];
    setError(null);
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false}});
      if (request !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = selectVoiceoverMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? {mimeType, audioBitsPerSecond: 192_000} : {audioBitsPerSecond: 192_000});
      streamRef.current = stream;
      recorderRef.current = recorder;
      for (const track of stream.getAudioTracks()) track.addEventListener("ended", () => {
        if (recorderRef.current === recorder && recorder.state !== "inactive" && !discardRef.current) {
          discardRef.current = true;
          fail({code: "device-lost", message: "The microphone disconnected while recording."});
        }
      }, {once: true});
      recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunksRef.current.push(event.data); });
      recorder.addEventListener("error", (event) => fail(classifyVoiceoverError((event as ErrorEvent).error)));
      recorder.addEventListener("stop", () => {
        const discarded = discardRef.current;
        const durationMs = Math.max(0, performance.now() - startedAtRef.current);
        const recording = new Blob(chunksRef.current, {type: recorder.mimeType || mimeType || "audio/webm"});
        releaseStream();
        chunksRef.current = [];
        if (discarded) return;
        if (!recording.size) {
          fail({code: "recording-failed", message: "The microphone did not produce any audio."});
          return;
        }
        const result = {blob: recording, mimeType: recording.type, durationMs, createdAt: Date.now()};
        setStatus("ready");
        onRecording?.(result);
      }, {once: true});
      startedAtRef.current = performance.now();
      recorder.start(250);
      setStatus("recording");
    } catch (caught) {
      if (request === requestRef.current) fail(classifyVoiceoverError(caught));
    }
  }, [fail, onRecording, releaseStream]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    discardRef.current = false;
    setStatus("stopping");
    recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    requestRef.current += 1;
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else releaseStream();
    setError(null);
    setStatus("idle");
  }, [releaseStream]);

  const reset = useCallback(() => { setError(null); setStatus("idle"); }, []);
  useEffect(() => () => {
    requestRef.current += 1;
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    releaseStream();
  }, [releaseStream]);
  return {status, error, start, stop, cancel, reset};
};
