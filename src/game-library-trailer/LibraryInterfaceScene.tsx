import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { ParticleField } from "../components/ParticleField";
import { SceneFrame } from "../components/SceneFrame";
import { GAME_LIBRARY_VIDEO, GAME_LIBRARY_VIDEO_TRIM } from "./data";

export const LibraryInterfaceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 18], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const push = interpolate(frame, [0, 104], [0.96, 1.02], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dim = interpolate(frame, [82, 104], [0, 0.46], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.26), rgba(5,4,10,0) 68%)",
        }}
      />
      <ParticleField seed="library-interface" count={34} opacity={0.56} rise={0.25} />

      <div
        style={{
          position: "relative",
          width: 1640,
          height: 824,
          overflow: "hidden",
          borderRadius: 28,
          border: "1px solid rgba(233,213,255,0.3)",
          background: "#09070F",
          boxShadow:
            "0 50px 130px rgba(0,0,0,0.72), 0 0 80px rgba(139,92,246,0.24), inset 0 0 34px rgba(255,255,255,0.03)",
          opacity: enter,
          scale: push,
          translate: `0 ${(1 - enter) * 70}px`,
        }}
      >
        <Video
          src={staticFile(GAME_LIBRARY_VIDEO)}
          muted
          trimBefore={GAME_LIBRARY_VIDEO_TRIM}
          objectFit="contain"
          style={{
            width: "100%",
            height: "100%",
            background: "#09070F",
          }}
        />
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(120deg, rgba(168,85,247,0.12), rgba(5,4,10,0) 45%, rgba(247,201,72,0.06))",
            mixBlendMode: "screen",
          }}
        />
        <AbsoluteFill style={{ background: `rgba(5,4,10,${dim})` }} />
        <div
          style={{
            position: "absolute",
            left: 40,
            right: 40,
            top: 0,
            height: 2,
            background:
              "linear-gradient(90deg, rgba(168,85,247,0), rgba(233,213,255,0.9), rgba(247,201,72,0))",
            boxShadow: "0 0 22px rgba(168,85,247,0.8)",
          }}
        />
      </div>
    </SceneFrame>
  );
};
