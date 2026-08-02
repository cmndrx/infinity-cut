import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { GoldText } from "../components/GoldText";
import { AnamorphicFlare, Shockwave } from "../components/ImpactFX";
import { ParticleField } from "../components/ParticleField";
import { SceneFrame } from "../components/SceneFrame";
import { BODY_FONT } from "../fonts";
import { GAME_WORLDS } from "./data";

const CARD_LAYOUT = [
  { x: -650, y: -220, rotate: -11 },
  { x: -520, y: 230, rotate: 8 },
  { x: 0, y: -355, rotate: 0 },
  { x: 520, y: 230, rotate: -8 },
  { x: 650, y: -220, rotate: 11 },
] as const;

export const LibraryHeroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const spread = interpolate(frame, [0, 25], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleIn = interpolate(frame, [5, 16], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleScale = interpolate(frame, [0, 12], [1.36, 1], {
    easing: Easing.bezier(0.12, 0.9, 0.24, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shine = interpolate(frame, [24, 66], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flare = interpolate(frame, [0, 8, 44, 83], [0, 0.95, 0.28, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(168,85,247,0.34) 0%, rgba(88,44,160,0.14) 30%, rgba(5,4,10,1) 72%)",
        }}
      />
      <ParticleField seed="library-hero" count={46} rise={0.7} opacity={0.76} />

      {GAME_WORLDS.map((world, index) => {
        const layout = CARD_LAYOUT[index];
        return (
          <div
            key={world.id}
            style={{
              position: "absolute",
              left: 960 + layout.x * spread,
              top: 540 + layout.y * spread,
              width: 430,
              height: 242,
              translate: "-50% -50%",
              rotate: `${layout.rotate * spread}deg`,
              scale: 0.45 + spread * 0.55,
              opacity: 0.15 + spread * 0.42,
              overflow: "hidden",
              borderRadius: 18,
              border: `1px solid ${world.accent}88`,
              boxShadow: `0 22px 64px rgba(0,0,0,0.68), 0 0 34px ${world.accent}40`,
            }}
          >
            <Img
              src={staticFile(world.artwork)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "saturate(0.82) brightness(0.7)",
              }}
            />
          </div>
        );
      })}

      <Shockwave at={0} duration={42} maxRadius={1850} color="192,132,252" />
      <Shockwave at={5} duration={48} maxRadius={1450} color="247,201,72" />
      <AnamorphicFlare opacity={flare} width={1900} />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
            opacity: titleIn,
            scale: titleScale,
          }}
        >
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "0.56em",
              paddingLeft: "0.56em",
              color: "rgba(233,213,255,0.9)",
              textShadow: "0 0 24px rgba(168,85,247,0.7)",
            }}
          >
            INFINFT STUDIOS
          </div>
          <GoldText
            fontSize={122}
            letterSpacing="0.035em"
            shineProgress={shine}
            glow={0.92}
          >
            THE GAME LIBRARY
          </GoldText>
          <div
            style={{
              width: 520,
              height: 3,
              background:
                "linear-gradient(90deg, rgba(247,201,72,0), #FFE9A3, rgba(247,201,72,0))",
              boxShadow: "0 0 26px rgba(247,201,72,0.74)",
            }}
          />
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
