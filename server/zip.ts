import {createWriteStream} from "node:fs";
import {readFile, stat} from "node:fs/promises";
import {once} from "node:events";

const table = Array.from({length: 256}, (_, value) => {
  let result = value;
  for (let bit = 0; bit < 8; bit++) result = result & 1 ? 0xedb88320 ^ (result >>> 1) : result >>> 1;
  return result >>> 0;
});

const crc32 = (data: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

export const writeStoredZip = async (outputPath: string, files: {path: string; name: string}[]) => {
  const output = createWriteStream(outputPath, {flags: "wx"});
  let offset = 0;
  const central: Buffer[] = [];
  const write = async (buffer: Buffer) => {
    if (!output.write(buffer)) await once(output, "drain");
    offset += buffer.length;
  };
  try {
    for (const file of files) {
      const body = await readFile(file.path);
      const name = Buffer.from(file.name.replace(/\\/g, "/"), "utf8");
      const crc = crc32(body);
      const localOffset = offset;
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
      local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26);
      await write(local); await write(name); await write(body);
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x0800, 8);
      header.writeUInt32LE(crc, 16); header.writeUInt32LE(body.length, 20); header.writeUInt32LE(body.length, 24); header.writeUInt16LE(name.length, 28); header.writeUInt32LE(localOffset, 42);
      central.push(header, name);
    }
    const centralOffset = offset;
    for (const buffer of central) await write(buffer);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(offset - centralOffset, 12); end.writeUInt32LE(centralOffset, 16);
    await write(end);
    output.end();
    await once(output, "close");
    return (await stat(outputPath)).size;
  } catch (error) {
    output.destroy();
    throw error;
  }
};
