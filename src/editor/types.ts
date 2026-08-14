export type MediaKind = "video" | "image" | "audio" | "title" | "caption" | "sequence";

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  textAlign: "left" | "center" | "right";
  letterSpacing: number;
  lineHeight: number;
  strokeColor: string;
  strokeWidth: number;
};

export type Transform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};

export type Effects = {
  enabled: boolean;
  colorEnabled: boolean;
  blurEnabled: boolean;
  vignetteEnabled: boolean;
  grainEnabled: boolean;
  glowEnabled: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  temperature: number;
  tint: number;
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vibrance: number;
  hue: number;
  fade: number;
  sharpen: number;
  vignette: number;
  grain: number;
  glow: number;
  look: string;
  maskEnabled: boolean;
  maskInverted: boolean;
  maskX: number;
  maskY: number;
  maskSize: number;
  maskFeather: number;
};

export type KeyframeProperty =
  | "transform.x"
  | "transform.y"
  | "transform.scale"
  | "transform.rotation"
  | "transform.opacity"
  | "effects.brightness"
  | "effects.contrast"
  | "effects.saturation"
  | "effects.blur"
  | "effects.temperature"
  | "effects.tint"
  | "effects.exposure"
  | "effects.highlights"
  | "effects.shadows"
  | "effects.whites"
  | "effects.blacks"
  | "effects.vibrance"
  | "effects.hue"
  | "effects.fade"
  | "effects.sharpen"
  | "effects.vignette"
  | "effects.grain"
  | "effects.glow"
  | "audio.volume";

export type ClipKeyframe = {
  id: string;
  property: KeyframeProperty;
  frame: number;
  value: number;
  easing: "linear" | "ease-in-out";
};

export type TransitionType = "cross-dissolve" | "dip-to-black" | "wipe-left" | "slide-left";

export type EditorTransition = {
  id: string;
  fromClipId: string;
  toClipId: string;
  type: TransitionType;
  duration: number;
};

export type EditorClip = {
  id: string;
  name: string;
  kind: MediaKind;
  trackId: string;
  start: number;
  duration: number;
  sourceStart: number;
  src?: string;
  color: string;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  audioMuted: boolean;
  playbackRate?: number;
  preservePitch?: boolean;
  transform: Transform;
  effects: Effects;
  keyframes: ClipKeyframe[];
  text?: string;
  textStyle?: TextStyle;
  linkedGroupId?: string;
  sourceMediaId?: string;
  nestedSequenceId?: string;
};

export type MediaBin = {
  id: string;
  name: string;
};

export type ProjectMedia = {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  src: string;
  duration: number;
  color: string;
  binId: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  fps?: number;
  durationInSeconds?: number;
  importedAt?: number;
  fingerprint?: string;
  renderReady?: boolean;
  offline?: boolean;
};

export type EditorMarker = {
  id: string;
  frame: number;
  label: string;
  color: string;
};

export type EditorTrack = {
  id: string;
  name: string;
  kind: "video" | "audio" | "caption";
  muted: boolean;
  solo: boolean;
  volume: number;
  hidden: boolean;
  locked: boolean;
};

export type EditorProject = {
  name: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  tracks: EditorTrack[];
  clips: EditorClip[];
  markers: EditorMarker[];
  transitions: EditorTransition[];
  mediaBins: MediaBin[];
  media: ProjectMedia[];
  activeSequenceId: string;
  sequences: EditorSequence[];
};

export type EditorSequence = {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  tracks: EditorTrack[];
  clips: EditorClip[];
  markers: EditorMarker[];
  transitions: EditorTransition[];
};

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale: 100,
  rotation: 0,
  opacity: 100,
};

export const DEFAULT_EFFECTS: Effects = {
  enabled: true,
  colorEnabled: true,
  blurEnabled: true,
  vignetteEnabled: true,
  grainEnabled: true,
  glowEnabled: true,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  temperature: 0,
  tint: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  vibrance: 0,
  hue: 0,
  fade: 0,
  sharpen: 0,
  vignette: 0,
  grain: 0,
  glow: 0,
  look: "Custom",
  maskEnabled: false,
  maskInverted: false,
  maskX: 50,
  maskY: 50,
  maskSize: 65,
  maskFeather: 35,
};

export const DEFAULT_TITLE_STYLE: TextStyle = {
  fontFamily: "Inter, Arial, sans-serif",
  fontSize: 84,
  fontWeight: 800,
  color: "#ffffff",
  backgroundColor: "#000000",
  backgroundOpacity: 0,
  textAlign: "center",
  letterSpacing: 8,
  lineHeight: 1,
  strokeColor: "#000000",
  strokeWidth: 0,
};

export const DEFAULT_CAPTION_STYLE: TextStyle = {
  fontFamily: "Inter, Arial, sans-serif",
  fontSize: 48,
  fontWeight: 700,
  color: "#ffffff",
  backgroundColor: "#000000",
  backgroundOpacity: 72,
  textAlign: "center",
  letterSpacing: 0,
  lineHeight: 1.25,
  strokeColor: "#000000",
  strokeWidth: 1,
};
