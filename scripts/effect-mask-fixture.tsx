// Browser verification fixture, served only when explicitly imported by the QA script.
import {createRoot, type Root} from "react-dom/client";
import {Player} from "@remotion/player";
import {EditorComposition} from "../src/editor/EditorComposition";
import {sampleProject} from "../src/editor/project";
import {createDefaultMask} from "../src/editor/masks";
import {DEFAULT_EFFECTS, type MaskTarget} from "../src/editor/types";

let root: Root;
export const showMaskFixture = (target: MaskTarget, enabled: boolean) => {
  if (!root) { document.body.innerHTML = '<div id="fixture"></div>'; document.body.style.margin = "0"; root = createRoot(document.getElementById("fixture")!); }
  const project = structuredClone(sampleProject);
  project.width = 320; project.height = 180; project.durationInFrames = 30;
  project.tracks = [{id: "v1", name: "V1", kind: "video", hidden: false, muted: true, solo: false, locked: false, volume: 1}];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#999"/><rect width="8" height="16" fill="#ddd"/></pattern></defs><rect width="320" height="180" fill="url(#p)"/></svg>';
  project.clips = [{...project.clips[0], id: "fixture", kind: "image", trackId: "v1", start: 0, duration: 30, src: `data:image/svg+xml,${encodeURIComponent(svg)}`, sourceMediaId: undefined, colorGrade: undefined, keyframes: [], transform: {x: 0, y: 0, scale: 100, rotation: 0, opacity: 100}, effects: {...DEFAULT_EFFECTS, blur: target === "blur" && enabled ? 8 : 0, glow: target === "glow" && enabled ? 100 : 0, grain: target === "grain" && enabled ? 100 : 0, vignette: target === "vignette" && enabled ? 100 : 0}, effectMasks: [{...createDefaultMask("target", "rectangle"), target, x: 25, width: 50, height: 100, feather: 0}]}];
  project.media = []; project.transitions = [];
  root.render(<Player component={EditorComposition} inputProps={{project}} durationInFrames={30} fps={30} compositionWidth={320} compositionHeight={180} style={{width: 320, height: 180}} controls={false} />);
};
