import path from "node:path";

export const safeMediaFilename = (value: string) => value
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 120) || "media-file";

/** Editor sources are URLs, not arbitrary local filesystem paths. */
export const resolveMediaSourcePath = (src: string, root: string, mediaDir: string) => {
  if (/^https?:\/\//i.test(src)) return src;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) throw new Error("Unsupported media source; import or relink this file first");
  const pathname = decodeURIComponent(src.split(/[?#]/, 1)[0]);
  if (pathname.includes("\0") || pathname.includes("\\") || pathname.split("/").includes("..")) throw new Error("Media source escapes its storage directory");
  const upload = pathname.match(/^\/api\/media\/([a-f0-9-]+)\/([^/]+)$/i);
  if (upload) return path.join(mediaDir, `${upload[1]}-${safeMediaFilename(upload[2])}`);
  if (pathname.startsWith("/api/")) throw new Error("Unknown staged media source");
  const publicRoot = path.resolve(root, "public");
  const resolved = path.resolve(publicRoot, pathname.replace(/^\/+/, ""));
  if (!resolved.startsWith(`${publicRoot}${path.sep}`)) throw new Error("Invalid public media source");
  return resolved;
};
