export const GAME_LIBRARY_FPS = 30;
export const GAME_LIBRARY_WIDTH = 1920;
export const GAME_LIBRARY_HEIGHT = 1080;
export const INTRO_START = 0;
export const INTRO_DURATION = 126;

export const MONTAGE_START = INTRO_START + INTRO_DURATION;
// Five unhurried 4.5-second game spotlights: artwork first, then gameplay.
export const MONTAGE_DURATION = 675;

export const LIBRARY_INTERFACE_START = MONTAGE_START + MONTAGE_DURATION;
export const LIBRARY_INTERFACE_DURATION = 105;

export const LIBRARY_HERO_START = LIBRARY_INTERFACE_START + LIBRARY_INTERFACE_DURATION;
export const LIBRARY_HERO_DURATION = 84;

export const CTA_START = LIBRARY_HERO_START + LIBRARY_HERO_DURATION;
export const CTA_DURATION = 57;

export const GAME_LIBRARY_DURATION_FRAMES = CTA_START + CTA_DURATION;

export const GAME_LIBRARY_COLORS = {
  background: "#05040A",
  purple: "#8B5CF6",
  brightPurple: "#A855F7",
  lavender: "#E9D5FF",
  gold: "#F7C948",
  goldBright: "#FFE9A3",
  white: "#FFFFFF",
} as const;
