import {describe, expect, it} from "vitest";
import {createDefaultMask} from "./masks";
import {effectMaskImage} from "./mask-image";

describe("rendered effect-mask geometry", () => {
  it("uses a rectangle, rotation and animated opacity rather than an ellipse fallback", () => {
    const mask = createDefaultMask("mask", "rectangle");
    mask.rotation = 45;
    mask.keyframes = [{id: "opacity", property: "opacity", frame: 0, value: 25, easing: "linear"}];
    const svg = decodeURIComponent(effectMaskImage(mask, 0));
    expect(svg).toContain('transform="rotate(45 50 50)"');
    expect(svg).toContain('opacity="0.25"');
    expect(svg).not.toContain("<ellipse");
  });
  it("inverts the geometry inside the SVG mask and retains feathering", () => {
    const mask = createDefaultMask("mask", "ellipse");
    mask.inverted = true;
    const svg = decodeURIComponent(effectMaskImage(mask, 0));
    expect(svg).toContain("<ellipse");
    expect(svg).toContain('<g fill="black"');
    expect(svg).toContain("feGaussianBlur");
  });
});
