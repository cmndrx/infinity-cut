import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  useCurrentFrame,
} from "remotion";
import { GoldText } from "../components/GoldText";
import {
  AnamorphicFlare,
  ChromaticImpact,
  Shockwave,
} from "../components/ImpactFX";
import { ParticleField } from "../components/ParticleField";
import { SceneFrame } from "../components/SceneFrame";
import { COLORS, ICE_TEXT_GRADIENT } from "../config";
import { DISPLAY_FONT } from "../fonts";

const BURST_COUNT = 64;

/**
 * Scene 5 — the biggest hit in the trailer. SEASON 3 slams in on a
 * purple detonation: shockwaves, radial debris streaks, anamorphic flare.
 */
export const SceneHeroReveal: React.FC = () => {
  const frame = useCurrentFrame();

  const slam = interpolate(frame, [0, 8], [1.5, 1], {
    easing: Easing.bezier(0.1, 0.9, 0.2, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const appear = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = interpolate(frame, [16, 24, 40], [1, 1.045, 1], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chroma = interpolate(frame, [0, 9], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const coreGlow = interpolate(frame, [0, 8, 34, 89], [1, 0.9, 0.55, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flare = interpolate(frame, [0, 7, 30, 70], [0, 0.9, 0.3, 0.14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shine = interpolate(frame, [22, 58], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const settle = interpolate(frame, [10, 89], [1, 1.035], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 48%, rgba(168,85,247,${0.3 * coreGlow}) 0%, rgba(88,44,160,${0.14 * coreGlow}) 26%, ${COLORS.background} 68%)`,
        }}
      />

      {/* Detonation core */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "48%",
          width: 1500,
          height: 1000,
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(ellipse, rgba(233,213,255,0.4) 0%, rgba(168,85,247,0.3) 22%, rgba(247,201,72,0.1) 44%, rgba(5,4,10,0) 70%)",
          filter: "blur(18px)",
          opacity: coreGlow,
          mixBlendMode: "screen",
        }}
      />

      {/* Radial debris streaks */}
      {Array.from({ length: BURST_COUNT }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / BURST_COUNT + random(`ba${i}`) * 0.22;
        const speed = 0.6 + random(`bs${i}`) * 0.9;
        const dist = interpolate(frame, [0, 66], [60, (620 + random(`bd${i}`) * 420) * speed], {
          easing: Easing.out(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const fade = interpolate(frame, [14, 64], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist * 0.58;
        const len = 10 + random(`bl${i}`) * 26;
        const gold = random(`bg${i}`) < 0.22;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "48%",
              width: len,
              height: 3,
              borderRadius: 999,
              transform: `translate(${x}px, ${y}px) rotate(${(angle * 180) / Math.PI}deg)`,
              background: gold
                ? "linear-gradient(90deg, rgba(247,201,72,0), #FFE9A3)"
                : "linear-gradient(90deg, rgba(168,85,247,0), #E9D5FF)",
              boxShadow: gold
                ? "0 0 14px rgba(247,201,72,0.8)"
                : "0 0 16px rgba(168,85,247,0.85)",
              opacity: fade * (0.4 + random(`bo${i}`) * 0.6),
              mixBlendMode: "screen",
            }}
          />
        );
      })}

      <Shockwave at={0} duration={40} maxRadius={1900} y="48%" color="192,132,252" />
      <Shockwave at={4} duration={44} maxRadius={1500} y="48%" color="247,201,72" />
      <Shockwave at={9} duration={48} maxRadius={1200} y="48%" color="233,213,255" />

      <AnamorphicFlare opacity={flare} y="48%" width={1900} />

      <ParticleField seed="hero" count={40} rise={0.9} opacity={0.7} />

      {/* Title lockup */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transform: `translateY(-46px) scale(${slam * pulse * settle})`,
            opacity: appear,
          }}
        >
          <ChromaticImpact amount={chroma}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  fontFamily: DISPLAY_FONT,
                  fontSize: 96,
                  fontWeight: 800,
                  letterSpacing: "0.62em",
                  paddingLeft: "0.62em",
                  textTransform: "uppercase",
                  background: ICE_TEXT_GRADIENT,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  filter:
                    "drop-shadow(0 0 26px rgba(255,255,255,0.25)) drop-shadow(0 0 60px rgba(168,85,247,0.6))",
                }}
              >
                Season
              </div>
              <div style={{ marginTop: -30 }}>
                <GoldText fontSize={430} letterSpacing="0" shineProgress={shine} glow={0.9}>
                  3
                </GoldText>
              </div>
            </div>
          </ChromaticImpact>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
