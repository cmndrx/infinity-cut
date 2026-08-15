import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {writeStoredZip} from "./zip";

describe("writeStoredZip", () => {
  it("writes a standards-shaped UTF-8 ZIP archive without a shell", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "dcpro-zip-"));
    try {
      const source = path.join(directory, "frame.png");
      const output = path.join(directory, "frames.zip");
      await writeFile(source, Buffer.from([1, 2, 3, 4]));
      expect(await writeStoredZip(output, [{path: source, name: "frames/frame-0001.png"}])).toBeGreaterThan(4);
      const archive = await readFile(output);
      expect(archive.readUInt32LE(0)).toBe(0x04034b50);
      expect(archive.includes(Buffer.from("frames/frame-0001.png"))).toBe(true);
      expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  });
});
