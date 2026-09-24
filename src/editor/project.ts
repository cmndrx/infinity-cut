import type {EditorProject} from "./types";
export const createEmptyProject = (name = "Untitled project"): EditorProject => ({
 name, width: 1920, height: 1080, fps: 30, durationInFrames: 450,
 markers: [], transitions: [], media: [], clips: [],
 mediaBins: [{id: "bin-video", name: "Video"}, {id: "bin-audio", name: "Audio"}, {id: "bin-graphics", name: "Graphics"}],
  tracks: [
    {id: "c1", name: "C1", kind: "caption", muted: false, solo: false, volume: 1, hidden: false, locked: false},
    {id: "v3", name: "V3", kind: "video", muted: false, solo: false, volume: 1, hidden: false, locked: false},
    {id: "v2", name: "V2", kind: "video", muted: false, solo: false, volume: 1, hidden: false, locked: false},
    {id: "v1", name: "V1", kind: "video", muted: false, solo: false, volume: 1, hidden: false, locked: false},
    {id: "a1", name: "A1", kind: "audio", muted: false, solo: false, volume: 1, hidden: false, locked: false},
    {id: "a2", name: "A2", kind: "audio", muted: false, solo: false, volume: 1, hidden: false, locked: false},
  ],
});
