import { AbsoluteFill, Sequence } from "remotion";
import { CinematicOverlay } from "../components/CinematicOverlay";
import { Flash } from "../components/ImpactFX";
import {
  CTA_DURATION,
  CTA_START,
  GAME_LIBRARY_COLORS,
  INTRO_DURATION,
  INTRO_START,
  LIBRARY_HERO_DURATION,
  LIBRARY_HERO_START,
  LIBRARY_INTERFACE_DURATION,
  LIBRARY_INTERFACE_START,
  MONTAGE_DURATION,
  MONTAGE_START,
} from "./config";
import { GameWorldMontageScene } from "./GameWorldMontageScene";
import { LibraryCtaScene } from "./LibraryCtaScene";
import { LibraryHeroScene } from "./LibraryHeroScene";
import { LibraryInterfaceScene } from "./LibraryInterfaceScene";
import { LibrarySoundDesign } from "./LibrarySoundDesign";
import { WorldsIntroScene } from "./WorldsIntroScene";

export const GameLibraryTrailer: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: GAME_LIBRARY_COLORS.background }}>
      <Sequence
        from={INTRO_START}
        durationInFrames={INTRO_DURATION}
        premountFor={30}
      >
        <WorldsIntroScene />
      </Sequence>
      <Sequence
        from={MONTAGE_START}
        durationInFrames={MONTAGE_DURATION}
        premountFor={30}
      >
        <GameWorldMontageScene />
      </Sequence>
      <Sequence
        from={LIBRARY_INTERFACE_START}
        durationInFrames={LIBRARY_INTERFACE_DURATION}
        premountFor={30}
      >
        <LibraryInterfaceScene />
      </Sequence>
      <Sequence
        from={LIBRARY_HERO_START}
        durationInFrames={LIBRARY_HERO_DURATION}
        premountFor={30}
      >
        <LibraryHeroScene />
      </Sequence>
      <Sequence from={CTA_START} durationInFrames={CTA_DURATION} premountFor={30}>
        <LibraryCtaScene />
      </Sequence>

      <Flash at={MONTAGE_START} duration={8} peak={0.76} color="233,213,255" />
      <Flash
        at={LIBRARY_INTERFACE_START}
        duration={7}
        peak={0.64}
        color="255,255,255"
      />
      <Flash
        at={LIBRARY_HERO_START}
        duration={12}
        peak={1}
        color="240,228,255"
      />
      <Flash at={CTA_START} duration={6} peak={0.36} color="216,180,254" />

      <CinematicOverlay />
      <LibrarySoundDesign />
    </AbsoluteFill>
  );
};
