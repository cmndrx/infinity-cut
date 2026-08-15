import {describe, expect, it, vi} from "vitest";
import {classifyVoiceoverError, selectVoiceoverMimeType, type VoiceoverRecording} from "./useVoiceoverRecorder";
import {uploadVoiceoverRecording} from "./VoiceoverRecorder";

describe("voiceover recording integration", () => {
  it("chooses the best supported recording format deterministically", () => {
    const Recorder = {isTypeSupported: vi.fn((type: string) => type === "audio/webm;codecs=opus")} as unknown as typeof MediaRecorder;
    expect(selectVoiceoverMimeType(Recorder)).toBe("audio/webm;codecs=opus");
  });

  it("turns browser permission and device errors into actionable states", () => {
    expect(classifyVoiceoverError(new DOMException("Denied", "NotAllowedError")).code).toBe("permission-denied");
    expect(classifyVoiceoverError(new DOMException("Gone", "NotReadableError")).code).toBe("device-unavailable");
  });

  it("uploads raw recorded audio through the existing media contract", async () => {
    const recording: VoiceoverRecording = {blob: new Blob(["voice"], {type: "audio/webm"}), mimeType: "audio/webm", durationMs: 1000, createdAt: 1};
    const fetcher = vi.fn(async () => new Response(JSON.stringify({url: "/api/media/source/voice.webm"}), {status: 200, headers: {"Content-Type": "application/json"}})) as unknown as typeof fetch;
    const result = await uploadVoiceoverRecording(recording, "Voice Take.webm", fetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/media?name=Voice%20Take.webm", expect.objectContaining({method: "POST", body: recording.blob, headers: {"Content-Type": "audio/webm"}}));
    expect(result).toEqual(expect.objectContaining({src: "/api/media/source/voice.webm", fileName: "Voice Take.webm", size: 5}));
  });
});
