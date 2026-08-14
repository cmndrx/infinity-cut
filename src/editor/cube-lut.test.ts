import {describe, expect, it} from "vitest";
import {applyLutWithIntensity, base64ToFloat32, evaluateLut, exportCubeLut, float32ToBase64, parseCubeLut} from "./cube-lut";

const identityCube = `
TITLE "Identity 2"
LUT_3D_SIZE 2
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

describe(".cube LUTs", () => {
  it("parses and trilinearly evaluates a 3D identity LUT", () => {
    const lut = parseCubeLut(identityCube, {id: "identity"});
    expect(lut).toMatchObject({id: "identity", name: "Identity 2", kind: "3d", size: 2});
    expect(evaluateLut(lut, [0.25, 0.5, 0.75])).toEqual(expect.arrayContaining([
      expect.closeTo(0.25, 6), expect.closeTo(0.5, 6), expect.closeTo(0.75, 6),
    ]));
  });

  it("supports 1D channel tables and domain normalization", () => {
    const lut = parseCubeLut(`LUT_1D_SIZE 2\nDOMAIN_MIN -1 -1 -1\nDOMAIN_MAX 1 1 1\n1 0 .5\n0 1 .5\n`);
    expect(evaluateLut(lut, [-1, 1, 0])).toEqual([1, 1, 0.5]);
    expect(applyLutWithIntensity(lut, [-1, 1, 0], 50)).toEqual([0, 1, 0.25]);
  });

  it("round-trips Float32 payloads and deterministic cube exports", () => {
    const values = new Float32Array([0, 0.125, 0.5, 1]);
    expect([...base64ToFloat32(float32ToBase64(values))]).toEqual([...values]);
    const parsed = parseCubeLut(identityCube);
    const reparsed = parseCubeLut(exportCubeLut(parsed));
    expect([...base64ToFloat32(reparsed.dataBase64)]).toEqual([...base64ToFloat32(parsed.dataBase64)]);
  });

  it("rejects malformed tables and unsupported directives", () => {
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0\n")).toThrow("Expected 8 LUT rows");
    expect(() => parseCubeLut("LUT_1D_SIZE 2\nLUT_3D_SIZE 2\n")).toThrow("both 1D and 3D");
    expect(() => parseCubeLut("FOO 2\n")).toThrow("Unsupported LUT directive");
  });
});
