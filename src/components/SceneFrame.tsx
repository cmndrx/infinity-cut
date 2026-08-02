import { AbsoluteFill } from "remotion";
import { COLORS } from "../config";
import { DISPLAY_FONT } from "../fonts";

export const SceneFrame: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: COLORS.background,
        color: COLORS.white,
        fontFamily: DISPLAY_FONT,
        overflow: "hidden",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
