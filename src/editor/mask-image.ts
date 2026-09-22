import {getAnimatedMaskProperty} from "./masks";
import type {EditorEffectMask} from "./types";

/** Self-contained SVG works as a CSS mask in both Player and final rendering. */
export const effectMaskImage = (mask: EditorEffectMask, frame: number) => {
  const value = (key: Parameters<typeof getAnimatedMaskProperty>[1]) => getAnimatedMaskProperty(mask, key, frame);
  const x = value("x"), y = value("y");
  const width = Math.max(.1, value("width")), height = Math.max(.1, value("height"));
  const opacity = Math.max(0, Math.min(1, value("opacity") / 100));
  const blur = Math.min(width, height) * Math.max(0, Math.min(100, value("feather"))) / 600;
  const fill = mask.inverted ? "black" : "white";
  const geometry = mask.shape === "rectangle"
    ? `<rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}"/>`
    : `<ellipse cx="${x}" cy="${y}" rx="${width / 2}" ry="${height / 2}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><filter id="f" x="-400%" y="-400%" width="900%" height="900%"><feGaussianBlur stdDeviation="${blur}"/></filter><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style="mask-type:luminance"><rect width="100" height="100" fill="${mask.inverted ? "white" : "black"}"/><g fill="${fill}" transform="rotate(${value("rotation")} ${x} ${y})" filter="url(#f)">${geometry}</g></mask></defs><rect width="100" height="100" fill="black" opacity="${opacity}" mask="url(#m)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};
