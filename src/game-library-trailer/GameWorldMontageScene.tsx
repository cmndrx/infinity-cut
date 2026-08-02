import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Flash } from "../components/ImpactFX";
import { SceneFrame } from "../components/SceneFrame";
import { BODY_FONT } from "../fonts";
import { GAME_WORLDS, type GameWorld } from "./data";

const GAMEPLAY_START = 42;
const ARTWORK_FADE_END = 54;

const GameWorldBeat: React.FC<{ world: GameWorld }> = ({ world }) => {
  const frame = useCurrentFrame();
  const artworkOpacity = interpolate(
    frame,
    [GAMEPLAY_START - 3, ARTWORK_FADE_END],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const artworkScale = interpolate(frame, [0, ARTWORK_FADE_END], [1.01, 1.07], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelOpacity = interpolate(
    frame,
    [ARTWORK_FADE_END - 3, ARTWORK_FADE_END + 9, world.durationInFrames - 12, world.durationInFrames - 1],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const labelTranslate = interpolate(
    frame,
    [ARTWORK_FADE_END - 3, ARTWORK_FADE_END + 9],
    [-40, 0],
    {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#05040A" }}>
      <Sequence
        from={GAMEPLAY_START}
        durationInFrames={world.durationInFrames - GAMEPLAY_START}
        premountFor={30}
      >
        <GameplayLayer world={world} />
      </Sequence>

      <Img
        src={staticFile(world.artwork)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: artworkOpacity,
          scale: artworkScale,
          filter: "saturate(1.08) contrast(1.06)",
        }}
      />

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(5,4,10,0.06) 40%, rgba(5,4,10,0.74) 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 132,
          bottom: 142,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: labelOpacity,
          translate: `${labelTranslate}px 0`,
        }}
      >
        <div
          style={{
            width: 6,
            height: 52,
            background: world.accent,
            boxShadow: `0 0 24px ${world.accent}`,
          }}
        />
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: 42,
            fontWeight: 800,
            letterSpacing: "0.17em",
            textTransform: "uppercase",
            color: "#FFFFFF",
            textShadow: "0 3px 24px rgba(0,0,0,0.9)",
          }}
        >
          {world.name}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const GameplayLayer: React.FC<{ world: GameWorld }> = ({ world }) => {
  const frame = useCurrentFrame();
  const gameplayDuration = world.durationInFrames - GAMEPLAY_START;
  const videoIn = interpolate(frame, [0, 12], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const zoom = interpolate(frame, [0, gameplayDuration], [1.025, 1.09], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#05040A" }}>
      <Video
        src={staticFile(world.video)}
        muted
        trimBefore={world.trimBefore}
        objectFit="cover"
        style={{
          width: "100%",
          height: "100%",
          objectPosition: world.objectPosition,
          opacity: videoIn,
          scale: zoom,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(115deg, ${world.accent}2E 0%, rgba(5,4,10,0.04) 46%, rgba(139,92,246,0.17) 100%)`,
          mixBlendMode: "overlay",
        }}
      />
    </AbsoluteFill>
  );
};

export const GameWorldMontageScene: React.FC = () => {
  return (
    <SceneFrame>
      {GAME_WORLDS.map((world) => (
        <Sequence
          key={world.id}
          from={world.montageStart}
          durationInFrames={world.durationInFrames}
          premountFor={30}
        >
          <GameWorldBeat world={world} />
        </Sequence>
      ))}
      {GAME_WORLDS.slice(1).map((world) => (
        <Flash
          key={`cut-${world.id}`}
          at={world.montageStart}
          duration={5}
          peak={0.5}
          color="233,213,255"
        />
      ))}
    </SceneFrame>
  );
};
