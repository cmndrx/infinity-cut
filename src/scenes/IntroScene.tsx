import { noise2D } from "@remotion/noise";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { KineticTitle } from "../components/KineticTitle";
import { SceneFrame } from "../components/SceneFrame";
import { COLORS } from "../config";
import { BODY_FONT } from "../fonts";

/**
 * Scene 1 — black field, embers, faint purple glow, slow drift.
 * "EVERY SEASON..." rises letter by letter out of the dark.
 */
export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Slow cinematic push-in with a whisper of handheld drift.
  const push = interpolate(frame, [0, 89], [1, 1.055], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const driftX = noise2D("cam1x", frame * 0.006, 0) * 7;
  const driftY = noise2D("cam1y", 0, frame * 0.006) * 4;

  const glow = interpolate(frame, [0, 60], [0.1, 0.5], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eyebrowOpacity = interpolate(frame, [14, 34], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lineProgress = interpolate(frame, [52, 82], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ellipsisCount = Math.floor(
    interpolate(frame, [58, 84], [0, 3.99], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <SceneFrame>
      <AbsoluteFill
        style={{
          transform: `translate3d(${driftX}px, ${driftY}px, 0) scale(${push})`,
        }}
      >
        <Background glowOpacity={glow} particleCount={64} seed="intro" />
        {/* Depth haze behind the title */}
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at 50% 52%, rgba(233,213,255,0.05) 0%, rgba(233,213,255,0.015) 22%, rgba(5,4,10,0) 48%)",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: "0.58em",
              textTransform: "uppercase",
              color: "rgba(247,201,72,0.72)",
              opacity: eyebrowOpacity,
              marginBottom: 34,
              textShadow: "0 0 22px rgba(247,201,72,0.35)",
              paddingLeft: "0.58em",
            }}
          >
            Infinft Royale
          </div>

          <div style={{ display: "flex", alignItems: "baseline" }}>
            <KineticTitle
              text="EVERY SEASON"
              startFrame={22}
              stagger={2.4}
              fontSize={124}
              letterSpacing="0.12em"
            />
            <span
              style={{
                fontFamily: "inherit",
                fontSize: 124,
                fontWeight: 900,
                color: COLORS.lavender,
                textShadow: "0 0 34px rgba(192,132,252,0.6)",
                marginLeft: 8,
                letterSpacing: "0.04em",
              }}
            >
              {".".repeat(ellipsisCount)}
            </span>
          </div>

          <div
            style={{
              marginTop: 40,
              width: 460 * lineProgress,
              height: 2,
              borderRadius: 999,
              background:
                "linear-gradient(90deg, rgba(247,201,72,0) 0%, rgba(247,201,72,0.9) 50%, rgba(247,201,72,0) 100%)",
              boxShadow: "0 0 20px rgba(247,201,72,0.5)",
              opacity: lineProgress,
            }}
          />
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
