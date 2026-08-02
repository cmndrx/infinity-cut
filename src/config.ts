export const TRAILER_FPS = 30;
export const TRAILER_WIDTH = 1920;
export const TRAILER_HEIGHT = 1080;
export const TRAILER_DURATION_SECONDS = 20;
export const TRAILER_DURATION_FRAMES = TRAILER_FPS * TRAILER_DURATION_SECONDS;

export const COLORS = {
  background: "#05040a",
  deepPurple: "#1a0b2e",
  purple: "#8B5CF6",
  brightPurple: "#A855F7",
  electric: "#C084FC",
  lavender: "#E9D5FF",
  gold: "#F7C948",
  goldBright: "#FFE9A3",
  goldDeep: "#B97A1B",
  white: "#FFFFFF",
  accentGlow: "#C084FC",
} as const;

// Metallic gold ramp used for display type — matches the logo's gold finish.
export const GOLD_TEXT_GRADIENT =
  "linear-gradient(178deg, #FFF9E3 0%, #FFEDB0 20%, #F8CE58 42%, #D69A26 58%, #8A5A12 68%, #E9B94A 80%, #FFE9A3 100%)";

// Soft white-to-lavender ramp for primary white type.
export const ICE_TEXT_GRADIENT =
  "linear-gradient(180deg, #FFFFFF 0%, #F3ECFF 55%, #C9B4EF 100%)";

// Cinematic letterbox bar height (px per bar).
export const LETTERBOX = 96;
