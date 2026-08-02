import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { GoldText } from "../components/GoldText";
import { ParticleField } from "../components/ParticleField";
import { SceneFrame } from "../components/SceneFrame";
import { BODY_FONT } from "../fonts";

export const LibraryCtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 14], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dateIn = interpolate(frame, [8, 22], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shine = interpolate(frame, [8, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [44, 56], [1, 0], {
    easing: Easing.inOut(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame>
      <AbsoluteFill
        style={{
          opacity: fadeOut,
          background:
            "radial-gradient(circle at 50% 48%, rgba(139,92,246,0.22) 0%, rgba(88,44,160,0.08) 34%, rgba(5,4,10,1) 72%)",
        }}
      >
        <ParticleField seed="library-cta" count={32} rise={0.32} opacity={0.62} />

        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 25,
              opacity: enter,
              translate: `0 ${(1 - enter) * 34}px`,
            }}
          >
            <div
              style={{
                fontFamily: BODY_FONT,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "0.58em",
                paddingLeft: "0.58em",
                color: "rgba(233,213,255,0.88)",
              }}
            >
              INFINFT STUDIOS
            </div>
            <GoldText
              fontSize={112}
              letterSpacing="0.04em"
              shineProgress={shine}
              glow={0.78}
            >
              THE GAME LIBRARY
            </GoldText>
            <div
              style={{
                marginTop: 8,
                width: 420,
                height: 2,
                background:
                  "linear-gradient(90deg, rgba(247,201,72,0), #FFE9A3, rgba(247,201,72,0))",
                boxShadow: "0 0 24px rgba(247,201,72,0.7)",
              }}
            />
            <div
              style={{
                marginTop: 10,
                fontFamily: BODY_FONT,
                fontSize: 70,
                fontWeight: 800,
                letterSpacing: "0.2em",
                paddingLeft: "0.2em",
                color: "#FFFFFF",
                textShadow:
                  "0 0 24px rgba(255,255,255,0.18), 0 0 52px rgba(168,85,247,0.5)",
                opacity: dateIn,
                scale: 0.92 + dateIn * 0.08,
              }}
            >
              COMING JULY 31
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneFrame>
  );
};
