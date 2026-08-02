import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Background } from "../components/Background";
import { SceneFrame } from "../components/SceneFrame";
import { BODY_FONT, DISPLAY_FONT } from "../fonts";
import { GAME_WORLDS } from "./data";

export const WorldsIntroScene: React.FC = () => {
  const frame = useCurrentFrame();

  const converge = interpolate(frame, [78, 120], [0, 1], {
    easing: Easing.bezier(0.7, 0, 0.84, 0),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const firstTitleOpacity = interpolate(frame, [18, 30, 62, 74], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const secondTitleOpacity = interpolate(frame, [74, 84, 112, 123], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const secondTitleScale = interpolate(frame, [74, 88], [1.28, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame>
      <Background glowOpacity={0.28} particleCount={42} seed="library-intro" />

      {GAME_WORLDS.map((world, index) => {
        const reveal = interpolate(
          frame,
          [6 + index * 5, 20 + index * 5],
          [0, 1],
          {
            easing: Easing.out(Easing.cubic),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        );
        const baseX = 240 + index * 360;
        const left = baseX + (960 - baseX) * converge;
        const width = 236 - converge * 196;
        const drift = Math.sin(frame * 0.025 + index * 1.3) * 10;

        return (
          <div
            key={world.id}
            style={{
              position: "absolute",
              left,
              top: 540 + drift,
              width,
              height: 748,
              translate: "-50% -50%",
              opacity: reveal * (1 - converge * 0.28),
              overflow: "hidden",
              clipPath: "polygon(18% 0, 100% 0, 82% 100%, 0 100%)",
              boxShadow: `0 0 ${38 + converge * 80}px ${world.accent}55`,
            }}
          >
            <Img
              src={staticFile(world.artwork)}
              style={{
                width: 680,
                height: "100%",
                objectFit: "cover",
                objectPosition: "50% 50%",
                translate: `${-220 + index * -16}px 0`,
                scale: 1.04,
                filter: "saturate(1.08) contrast(1.08) brightness(0.78)",
              }}
            />
            <AbsoluteFill
              style={{
                background:
                  "linear-gradient(180deg, rgba(5,4,10,0.05), rgba(5,4,10,0.42))",
              }}
            />
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 100 + converge * 1100,
          height: 100 + converge * 500,
          translate: "-50% -50%",
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(233,213,255,0.42) 0%, rgba(168,85,247,0.16) 34%, rgba(5,4,10,0) 72%)",
          filter: "blur(22px)",
          opacity: converge,
          mixBlendMode: "screen",
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 118,
            fontWeight: 900,
            letterSpacing: "0.1em",
            paddingLeft: "0.1em",
            color: "#FFFFFF",
            textShadow:
              "0 3px 24px rgba(0,0,0,0.9), 0 0 54px rgba(168,85,247,0.62)",
            opacity: firstTitleOpacity,
            scale: interpolate(frame, [18, 42], [1.08, 1], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          INFINITE WORLDS.
        </div>
        <div
          style={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            opacity: secondTitleOpacity,
            scale: secondTitleScale,
          }}
        >
          <div
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: 144,
              fontWeight: 900,
              letterSpacing: "0.08em",
              paddingLeft: "0.08em",
              color: "#FFFFFF",
              textShadow:
                "0 3px 24px rgba(0,0,0,0.9), 0 0 64px rgba(168,85,247,0.72)",
            }}
          >
            ONE LIBRARY.
          </div>
          <div
            style={{
              width: 380,
              height: 3,
              background:
                "linear-gradient(90deg, rgba(247,201,72,0), #FFE9A3, rgba(247,201,72,0))",
              boxShadow: "0 0 24px rgba(247,201,72,0.72)",
            }}
          />
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "0.5em",
              paddingLeft: "0.5em",
              color: "rgba(233,213,255,0.82)",
            }}
          >
            INFINFT STUDIOS
          </div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
