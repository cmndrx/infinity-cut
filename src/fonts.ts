import { loadFont as loadCinzel } from "@remotion/google-fonts/Cinzel";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";

const cinzel = loadCinzel("normal", {
  weights: ["700", "800", "900"],
  subsets: ["latin"],
});

const poppins = loadPoppins("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

// Royale serif display face — pairs with the gold serif logo.
export const DISPLAY_FONT = cinzel.fontFamily;
// The game's UI font — used for labels, CTAs and supporting copy.
export const BODY_FONT = poppins.fontFamily;
