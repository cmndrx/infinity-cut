import { TRAILER_FPS } from "./config";

export const secondsToFrames = (seconds: number) => Math.round(seconds * TRAILER_FPS);

export const SCENE_1_START = 0;
export const SCENE_1_DURATION = secondsToFrames(3);

export const SCENE_2_START = SCENE_1_START + SCENE_1_DURATION;
export const SCENE_2_DURATION = secondsToFrames(3);

export const SCENE_3_START = SCENE_2_START + SCENE_2_DURATION;
export const SCENE_3_DURATION = secondsToFrames(4);

export const SCENE_4_START = SCENE_3_START + SCENE_3_DURATION;
export const SCENE_4_DURATION = secondsToFrames(5);

export const SCENE_5_START = SCENE_4_START + SCENE_4_DURATION;
export const SCENE_5_DURATION = secondsToFrames(3);

export const SCENE_6_START = SCENE_5_START + SCENE_5_DURATION;
export const SCENE_6_DURATION = secondsToFrames(2);
