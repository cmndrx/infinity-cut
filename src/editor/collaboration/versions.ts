import type {EditorProject} from "../types";
import type {ProjectVersionSnapshot} from "./types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalize(child)]));
  return value;
};

export const stableProjectJson = (project: EditorProject) => JSON.stringify(canonicalize(project));

export const projectChecksum = (project: EditorProject) => {
  const value = stableProjectJson(project);
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const createVersionSnapshot = (project: EditorProject, input: {revision: number; parentRevision?: number; author: string; label?: string; now?: number; id?: string}): ProjectVersionSnapshot => {
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error("Revision must be a positive integer");
  const author = input.author.trim();
  if (!author) throw new Error("Version author is required");
  const snapshot = clone(project);
  const createdAt = input.now ?? Date.now();
  return {id: input.id ?? `version-${input.revision}-${projectChecksum(snapshot)}`, revision: input.revision, parentRevision: input.parentRevision, author, label: input.label?.trim() || undefined, createdAt, checksum: projectChecksum(snapshot), project: snapshot};
};
