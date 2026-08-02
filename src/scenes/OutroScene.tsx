import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { GoldText } from "../components/GoldText";
import { ParticleField } from "../components/ParticleField";
import { SceneFrame } from "../components/SceneFrame";
import { COLORS } from "../config";
import { BODY_FONT } from "../fonts";

const LOGO_SRC = staticFile("logo-assets/infinft-royale-3-tight.png");

/**
 * Scene 6 — hold on the logo, CTA steps in, fade to black.
 */
export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();

  const logoIn = interpolate(frame, [0, 12], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoFloat = Math.sin(frame * 0.06) * 4;
  // Specular sweep masked by the logo artwork itself (animated via
  // background-position so the mask stays locked to the logo).
  const shimmerPos = interpolate(frame, [8, 36], [130, -30], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const liveIn = interpolate(frame, [6, 15], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const playIn = interpolate(frame, [15, 24], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const urlIn = interpolate(frame, [24, 33], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [46, 59], [1, 0], {
    easing: Easing.inOut(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame>
      <AbsoluteFill style={{ opacity: fadeOut }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 40%, rgba(139,92,246,0.2) 0%, rgba(88,44,160,0.08) 28%, ${COLORS.background} 68%)`,
          }}
        />
        <ParticleField seed="outro" count={36} rise={0.4} opacity={0.6} />

        <AbsoluteFill style={{ alignItems: "center" }}>
          {/* Logo with masked shimmer */}
          <div
            style={{
              position: "absolute",
              top: 168,
              opacity: logoIn,
              transform: `translateY(${logoFloat + (1 - logoIn) * 20}px)`,
              filter:
                "drop-shadow(0 0 24px rgba(255,244,214,0.25)) drop-shadow(0 0 60px rgba(192,132,252,0.35)) drop-shadow(0 12px 44px rgba(0,0,0,0.6))",
            }}
          >
            <Img src={LOGO_SRC} style={{ width: 660, height: "auto", display: "block" }} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(112deg, rgba(255,255,255,0) 42%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 58%)`,
                backgroundSize: "300% 100%",
                backgroundPosition: `${shimmerPos}% 0%`,
                WebkitMaskImage: `url(${LOGO_SRC})`,
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskImage: `url(${LOGO_SRC})`,
                maskSize: "contain",
                maskRepeat: "no-repeat",
                mixBlendMode: "screen",
              }}
            />
          </div>

          <div
            style={{
              position: "absolute",
              top: 700,
              opacity: liveIn,
              transform: `translateY(${(1 - liveIn) * 22}px)`,
            }}
          >
            <GoldText fontSize={66} letterSpacing="0.3em" shineProgress={null} glow={0.6}>
              Live Now
            </GoldText>
          </div>

          <div
            style={{
              position: "absolute",
              top: 796,
              fontFamily: BODY_FONT,
              fontSize: 27,
              fontWeight: 600,
              letterSpacing: "0.52em",
              paddingLeft: "0.52em",
              textTransform: "uppercase",
              color: "rgba(233,213,255,0.85)",
              textShadow: "0 0 20px rgba(168,85,247,0.5)",
              opacity: playIn,
              transform: `translateY(${(1 - playIn) * 18}px)`,
            }}
          >
            Play Free
          </div>

          <div
            style={{
              position: "absolute",
              top: 866,
              padding: "15px 40px",
              borderRadius: 999,
              border: "1px solid rgba(247,201,72,0.35)",
              background: "rgba(12,9,20,0.72)",
              boxShadow:
                "0 0 28px rgba(168,85,247,0.18), inset 0 0 18px rgba(247,201,72,0.06)",
              fontFamily: BODY_FONT,
              fontSize: 25,
              fontWeight: 600,
              letterSpacing: "0.14em",
              color: COLORS.white,
              opacity: urlIn,
              transform: `translateY(${(1 - urlIn) * 14}px)`,
            }}
          >
            infinftroyale.com
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneFrame>
  );
};
