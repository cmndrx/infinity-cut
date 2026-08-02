import { GAME_LIBRARY_FPS } from "./config";

export type GameWorld = {
  id: string;
  name: string;
  artwork: string;
  video: string;
  montageStart: number;
  durationInFrames: number;
  trimBefore: number;
  accent: string;
  objectPosition: string;
};

const asset = (filename: string) => `trailers/game-library-launch/${filename}`;
const secondsToFrames = (seconds: number) => Math.round(seconds * GAME_LIBRARY_FPS);

export const GAME_WORLDS: GameWorld[] = [
  {
    id: "abandoned",
    name: "Abandoned",
    artwork: asset("abandoned-bg.png"),
    video: asset("abandoned.mov"),
    montageStart: 0,
    durationInFrames: 135,
    trimBefore: secondsToFrames(31),
    accent: "#8BD3FF",
    objectPosition: "50% 50%",
  },
  {
    id: "golf-galaxy",
    name: "Golf Galaxy",
    artwork: asset("golf-galaxy.png"),
    video: asset("golf-galaxy.mov"),
    montageStart: 135,
    durationInFrames: 135,
    trimBefore: secondsToFrames(6.2),
    accent: "#E879F9",
    objectPosition: "50% 50%",
  },
  {
    id: "infinft-royale",
    name: "InfiNFT Royale",
    artwork: asset("infinft-royale.png"),
    video: asset("infinft-royale.mov"),
    montageStart: 270,
    durationInFrames: 135,
    trimBefore: secondsToFrames(0.6),
    accent: "#F7C948",
    objectPosition: "50% 50%",
  },
  {
    id: "infinft-rush",
    name: "InfiNFT Rush",
    artwork: asset("infinft-rush.png"),
    video: asset("infinft-rush.mov"),
    montageStart: 405,
    durationInFrames: 135,
    trimBefore: secondsToFrames(21),
    accent: "#22D3EE",
    objectPosition: "50% 50%",
  },
  {
    id: "monster-mayhem",
    name: "Monster Mayhem",
    artwork: asset("monster-mayhem.png"),
    video: asset("monster-mayhem.mov"),
    montageStart: 540,
    durationInFrames: 135,
    trimBefore: secondsToFrames(8),
    accent: "#A3E635",
    objectPosition: "50% 50%",
  },
];

export const GAME_LIBRARY_VIDEO = asset("game-library.mov");
export const GAME_LIBRARY_VIDEO_TRIM = secondsToFrames(6);
