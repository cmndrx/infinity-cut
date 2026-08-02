import { AbsoluteFill, Sequence } from "remotion";
import { CinematicOverlay } from "./components/CinematicOverlay";
import { Flash } from "./components/ImpactFX";
import { TrailerAudio } from "./components/TrailerAudio";
import { IntroScene } from "./scenes/IntroScene";
import { LogoBuildScene } from "./scenes/LogoBuildScene";
import { MontageScene } from "./scenes/MontageScene";
import { OutroScene } from "./scenes/OutroScene";
import { SceneHeroReveal } from "./scenes/SceneHeroReveal";
import { UiRevealScene } from "./scenes/UiRevealScene";
import {
  SCENE_1_DURATION,
  SCENE_1_START,
  SCENE_2_DURATION,
  SCENE_2_START,
  SCENE_3_DURATION,
  SCENE_3_START,
  SCENE_4_DURATION,
  SCENE_4_START,
  SCENE_5_DURATION,
  SCENE_5_START,
  SCENE_6_DURATION,
  SCENE_6_START,
} from "./timeline";

export const SeasonThreeTrailer: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#05040a" }}>
      <Sequence from={SCENE_1_START} durationInFrames={SCENE_1_DURATION} premountFor={30}>
        <IntroScene />
      </Sequence>
      <Sequence from={SCENE_2_START} durationInFrames={SCENE_2_DURATION} premountFor={30}>
        <UiRevealScene />
      </Sequence>
      <Sequence from={SCENE_3_START} durationInFrames={SCENE_3_DURATION} premountFor={30}>
        <MontageScene />
      </Sequence>
      <Sequence from={SCENE_4_START} durationInFrames={SCENE_4_DURATION} premountFor={30}>
        <LogoBuildScene />
      </Sequence>
      <Sequence from={SCENE_5_START} durationInFrames={SCENE_5_DURATION} premountFor={30}>
        <SceneHeroReveal />
      </Sequence>
      <Sequence from={SCENE_6_START} durationInFrames={SCENE_6_DURATION} premountFor={30}>
        <OutroScene />
      </Sequence>

      {/* Boundary impacts — cuts land on flashes, not raw edits */}
      <Flash at={SCENE_3_START} duration={6} peak={0.5} color="216,180,254" />
      <Flash at={SCENE_5_START} duration={12} peak={1} color="240,228,255" />
      <Flash at={SCENE_6_START} duration={6} peak={0.35} color="216,180,254" />

      {/* Global film finish: grain, vignette, letterbox */}
      <CinematicOverlay />

      {/* Temp score + sound design (swap score-bed.wav for licensed track) */}
      <TrailerAudio />
    </AbsoluteFill>
  );
};
