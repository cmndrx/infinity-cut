import {describe, expect, it} from "vitest";
import {createBlankProject} from "../project-storage";
import {DEFAULT_EFFECTS, DEFAULT_TRANSFORM, type EditorClip} from "../types";
import {exportCmx3600Edl} from "./edl";
import {exportFcp7Xml} from "./fcp7-xml";
import {framesToTimecode} from "./timecode";

const clip = (values: Partial<EditorClip> = {}): EditorClip => ({
  id: "clip-1", name: "A & B <take>", kind: "video", trackId: "v1", start: 30, duration: 60, sourceStart: 15,
  src: "/api/media/source/My Clip.mov", sourceMediaId: "media-1", color: "#fff", volume: 1, fadeIn: 0, fadeOut: 0,
  audioMuted: false, playbackRate: 1, preservePitch: true, transform: {...DEFAULT_TRANSFORM}, effects: {...DEFAULT_EFFECTS}, keyframes: [],
  ...values,
});

const projectFixture = () => {
  const project = createBlankProject({name: "Interchange Test", width: 1920, height: 1080, fps: 30});
  project.durationInFrames = 300;
  project.media = [{id: "media-1", name: "My Clip", kind: "video", src: "/api/media/source/My Clip.mov", duration: 180, color: "#fff", binId: "bin-video", fileName: "My Clip.mov"}];
  project.clips = [clip()];
  return project;
};

describe("interchange timecode", () => {
  it("formats non-drop and SMPTE drop-frame boundaries", () => {
    expect(framesToTimecode(30, 30)).toBe("00:00:01:00");
    expect(framesToTimecode(17982, 29.97, true)).toBe("00:10:00;00");
    expect(framesToTimecode(107892, 29.97, true)).toBe("01:00:00;00");
  });
});

describe("CMX 3600 export", () => {
  it("writes deterministic source and record timecodes", () => {
    const result = exportCmx3600Edl(projectFixture());
    expect(result.filename).toBe("interchange-test.edl");
    expect(result.content).toContain("MYCLIP   V    C        00:00:00:15 00:00:02:15 00:00:01:00 00:00:03:00");
    expect(result.warnings).toEqual([]);
  });

  it("reports constructs it cannot safely translate", () => {
    const project = projectFixture();
    project.clips.push(clip({id: "title", kind: "title", name: "Generated title", sourceMediaId: undefined, src: undefined}));
    project.clips[0].playbackRate = 2;
    project.clips[0].effects.blur = 4;
    project.transitions = [{id: "transition", fromClipId: "clip-1", toClipId: "title", type: "cross-dissolve", duration: 12}];
    const result = exportCmx3600Edl(project);
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["generated-media-omitted", "retime-requires-conform", "effect-not-translated", "transition-not-translated"]));
    expect(result.content).toContain("DIRECTORS CUT PRO INTERCHANGE WARNINGS");
  });
});

describe("Final Cut Pro 7 XML export", () => {
  it("creates escaped xmeml with resolved media and sequence metadata", () => {
    const result = exportFcp7Xml(projectFixture(), {resolveMediaUrl: (source) => `file:///project${source}`});
    expect(result.content).toContain('<xmeml version="5">');
    expect(result.content).toContain("<width>1920</width><height>1080</height>");
    expect(result.content).toContain("<name>A &amp; B &lt;take&gt;</name>");
    expect(result.content).toContain("<pathurl>file:///project/api/media/source/My Clip.mov</pathurl>");
    expect(result.content).toContain("<start>30</start><end>90</end><in>15</in><out>75</out>");
  });
});
