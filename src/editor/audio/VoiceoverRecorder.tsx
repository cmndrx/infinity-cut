import {useCallback, useState} from "react";
import {useVoiceoverRecorder, type VoiceoverRecording} from "./useVoiceoverRecorder";

export type VoiceoverUpload = {src: string; fileName: string; mimeType: string; size: number};

export const uploadVoiceoverRecording = async (recording: VoiceoverRecording, fileName: string, fetcher: typeof fetch = fetch): Promise<VoiceoverUpload> => {
  const response = await fetcher(`/api/media?name=${encodeURIComponent(fileName)}`, {method: "POST", headers: {"Content-Type": recording.mimeType || "audio/webm"}, body: recording.blob});
  const result = await response.json() as {url?: string; error?: string};
  if (!response.ok || !result.url) throw new Error(result.error ?? "Voiceover upload failed");
  const src = typeof window === "undefined" ? result.url : new URL(result.url, window.location.origin).href;
  return {src, fileName, mimeType: recording.mimeType, size: recording.blob.size};
};

export type VoiceoverRecorderProps = {
  onRecorded?: (recording: VoiceoverRecording) => void;
  onUploaded: (upload: VoiceoverUpload, recording: VoiceoverRecording) => void;
  onError?: (message: string) => void;
  upload?: (recording: VoiceoverRecording, fileName: string) => Promise<VoiceoverUpload>;
};

export const VoiceoverRecorder = ({onRecorded, onUploaded, onError, upload = uploadVoiceoverRecording}: VoiceoverRecorderProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const handleRecording = useCallback(async (recording: VoiceoverRecording) => {
    onRecorded?.(recording);
    setUploading(true);
    setUploadError(null);
    const extension = recording.mimeType.includes("mp4") ? "m4a" : "webm";
    const fileName = `Voiceover ${new Date(recording.createdAt).toISOString().replace(/[:.]/g, "-")}.${extension}`;
    try {
      onUploaded(await upload(recording, fileName), recording);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Voiceover upload failed";
      setUploadError(message);
      onError?.(message);
    } finally {
      setUploading(false);
    }
  }, [onError, onRecorded, onUploaded, upload]);
  const recorder = useVoiceoverRecorder({onRecording: handleRecording, onError: (value) => onError?.(value.message)});
  return <section className="dc-voiceover" aria-label="Voiceover recorder">
    <header><strong>Voiceover</strong><span>{recorder.status === "requesting" ? "Waiting for microphone permission" : recorder.status}</span></header>
    {recorder.status === "idle" || recorder.status === "ready" || recorder.status === "error" ? <button type="button" disabled={uploading} onClick={() => void recorder.start()}>Record</button> : null}
    {recorder.status === "requesting" ? <button type="button" onClick={recorder.cancel}>Cancel request</button> : null}
    {recorder.status === "recording" ? <><button type="button" onClick={recorder.stop}>Stop and add</button><button type="button" onClick={recorder.cancel}>Discard</button></> : null}
    {recorder.status === "stopping" || uploading ? <progress aria-label={uploading ? "Uploading voiceover" : "Finishing voiceover"} /> : null}
    {recorder.error ? <p role="alert">{recorder.error.message}</p> : null}
    {uploadError ? <p role="alert">{uploadError}</p> : null}
  </section>;
};
