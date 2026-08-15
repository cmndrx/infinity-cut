import {createHash, randomBytes, randomUUID, timingSafeEqual} from "node:crypto";
import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import type {IncomingMessage, ServerResponse} from "node:http";
import type {Connect, Plugin} from "vite";
import type {EditorProject} from "./src/editor/types";
import type {ReviewComment} from "./src/editor/collaboration/types";

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-f-]{36}$/i;

type StoredVersion = {revision: number; createdAt: number; project: EditorProject};
export type SharedProjectRecord = {
  id: string;
  editorTokenHash: string;
  reviewerTokenHash: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  project: EditorProject;
  versions: StoredVersion[];
  comments: ReviewComment[];
};

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const matchesHash = (expectedHash: string, token: string) => {
  const supplied = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};
const tokenRole = (record: SharedProjectRecord, token: string) => matchesHash(record.editorTokenHash, token) ? "editor" : matchesHash(record.reviewerTokenHash, token) ? "reviewer" : null;
const publicRecord = (record: SharedProjectRecord) => ({
  id: record.id,
  revision: record.revision,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  project: record.project,
  comments: record.comments,
  versions: record.versions.map(({revision, createdAt}) => ({revision, createdAt})),
});

const validateProject = (value: unknown): EditorProject => {
  if (!value || typeof value !== "object") throw new Error("A project is required");
  const project = value as Partial<EditorProject>;
  if (typeof project.name !== "string" || !Array.isArray(project.sequences) || !Array.isArray(project.tracks) || !Array.isArray(project.clips)) throw new Error("Invalid Directors Cut Pro project");
  return value as EditorProject;
};

export class SharedProjectStore {
  private readonly locks = new Map<string, Promise<void>>();
  constructor(private readonly directory: string) {}

  private file(id: string) {
    if (!ID_PATTERN.test(id)) throw new Error("Invalid shared project id");
    return path.join(this.directory, `${id}.json`);
  }

  private async atomicWrite(record: SharedProjectRecord) {
    await mkdir(this.directory, {recursive: true});
    const destination = this.file(record.id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record), {encoding: "utf8", mode: 0o600});
    await rename(temporary, destination);
  }

  private async exclusive<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(id, queued);
    await previous;
    try { return await action(); }
    finally {
      release();
      if (this.locks.get(id) === queued) this.locks.delete(id);
    }
  }

  async create(projectValue: unknown) {
    const project = validateProject(projectValue);
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const reviewerToken = randomBytes(32).toString("base64url");
    const now = Date.now();
    const record: SharedProjectRecord = {id, editorTokenHash: tokenHash(token), reviewerTokenHash: tokenHash(reviewerToken), revision: 1, createdAt: now, updatedAt: now, project, comments: [], versions: [{revision: 1, createdAt: now, project}]};
    await this.atomicWrite(record);
    return {record, token, reviewerToken};
  }

  async read(id: string) {
    const raw = await readFile(this.file(id), "utf8");
    return JSON.parse(raw) as SharedProjectRecord;
  }

  async update(id: string, token: string, baseRevision: number, projectValue: unknown) {
    return this.exclusive(id, async () => {
      const record = await this.read(id);
      if (tokenRole(record, token) !== "editor") throw Object.assign(new Error("Editor access is required"), {status: 403});
      if (record.revision !== baseRevision) throw Object.assign(new Error("The shared project changed elsewhere"), {status: 409, current: publicRecord(record)});
      const project = validateProject(projectValue);
      const revision = record.revision + 1;
      const updatedAt = Date.now();
      const next: SharedProjectRecord = {...record, revision, updatedAt, project, versions: [...record.versions, {revision, createdAt: updatedAt, project}].slice(-50)};
      await this.atomicWrite(next);
      return next;
    });
  }

  async replaceComments(id: string, token: string, comments: ReviewComment[]) {
    return this.exclusive(id, async () => {
      const record = await this.read(id);
      if (tokenRole(record, token) !== "editor") throw Object.assign(new Error("Editor access is required"), {status: 403});
      if (!Array.isArray(comments) || comments.length > 10_000) throw Object.assign(new Error("Invalid review comments"), {status: 400});
      const incomingIds = new Set(comments.map((comment) => comment.id));
      const mergedComments = [...comments, ...record.comments.filter((comment) => !incomingIds.has(comment.id))].slice(0, 10_000);
      const next = {...record, comments: mergedComments, updatedAt: Date.now()};
      await this.atomicWrite(next);
      return next;
    });
  }

  async appendComment(id: string, token: string, comment: ReviewComment) {
    return this.exclusive(id, async () => {
      const record = await this.read(id);
      const role = tokenRole(record, token);
      if (!role) throw Object.assign(new Error("Invalid share token"), {status: 401});
      if (!comment || typeof comment.id !== "string" || typeof comment.body !== "string" || !comment.body.trim() || record.comments.some((item) => item.id === comment.id)) throw Object.assign(new Error("Invalid review comment"), {status: 400});
      const safeComment = {...comment, author: role === "reviewer" ? "Reviewer" : comment.author, status: "open" as const, replies: []};
      const next = {...record, comments: [safeComment, ...record.comments].slice(0, 10_000), updatedAt: Date.now()};
      await this.atomicWrite(next);
      return next;
    });
  }
}

const sendJson = (response: ServerResponse, status: number, value: unknown) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
};
const readJson = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request exceeds the 12 MB limit"), {status: 413});
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
};
const bearer = (request: IncomingMessage) => request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ?? "";

export const directorsCutProCollaborationPlugin = (): Plugin => {
  const install = (middlewares: Connect.Server, root: string) => {
    const store = new SharedProjectStore(path.join(root, ".infinity-cut", "shared-projects"));
    middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (!url.pathname.startsWith("/api/shared-projects")) return next();
      try {
        if (request.method === "POST" && url.pathname === "/api/shared-projects") {
          const body = await readJson(request);
          const {record, token, reviewerToken} = await store.create(body.project);
          return sendJson(response, 201, {...publicRecord(record), token, reviewerToken});
        }
        const match = url.pathname.match(/^\/api\/shared-projects\/([^/]+)(?:\/(comments))?$/);
        if (!match) return sendJson(response, 404, {error: "Shared project endpoint not found"});
        const id = match[1];
        const record = await store.read(id);
        if (!tokenRole(record, bearer(request))) return sendJson(response, 401, {error: "Invalid share token"});
        if (request.method === "GET" && !match[2]) return sendJson(response, 200, publicRecord(record));
        if (request.method === "PUT" && !match[2]) {
          const body = await readJson(request);
          const updated = await store.update(id, bearer(request), Number(body.baseRevision), body.project);
          return sendJson(response, 200, publicRecord(updated));
        }
        if (request.method === "PUT" && match[2] === "comments") {
          const body = await readJson(request);
          const updated = await store.replaceComments(id, bearer(request), body.comments as ReviewComment[]);
          return sendJson(response, 200, publicRecord(updated));
        }
        if (request.method === "POST" && match[2] === "comments") {
          const body = await readJson(request);
          const updated = await store.appendComment(id, bearer(request), body.comment as ReviewComment);
          return sendJson(response, 201, publicRecord(updated));
        }
        return sendJson(response, 405, {error: "Method not allowed"});
      } catch (error) {
        const detail = error as Error & {status?: number; current?: unknown; code?: string};
        const status = detail.status ?? (detail.code === "ENOENT" ? 404 : detail instanceof SyntaxError ? 400 : 500);
        return sendJson(response, status, {error: detail.message || "Shared project request failed", current: detail.current});
      }
    });
  };
  return {
    name: "directors-cut-pro-collaboration-service",
    configureServer(server) { install(server.middlewares, server.config.root); },
    configurePreviewServer(server) { install(server.middlewares, server.config.root); },
  };
};
