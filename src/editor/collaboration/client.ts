import type {EditorProject} from "../types";
import type {ReviewComment} from "./types";

export type SharedProjectSession = {id: string; token: string; reviewerToken?: string; revision: number; role?: "editor" | "reviewer"};
export type SharedProjectPayload = {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  project: EditorProject;
  comments: ReviewComment[];
  versions: {revision: number; createdAt: number}[];
};

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const body = await response.json() as T & {error?: string};
  if (!response.ok) throw Object.assign(new Error(body.error ?? "Collaboration request failed"), {status: response.status, payload: body});
  return body;
};
const authenticated = (session: SharedProjectSession, method: string, body?: unknown): RequestInit => ({
  method,
  headers: {Authorization: `Bearer ${session.token}`, ...(body === undefined ? {} : {"Content-Type": "application/json"})},
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const publishSharedProject = async (project: EditorProject): Promise<{session: SharedProjectSession; payload: SharedProjectPayload}> => {
  const result = await request<SharedProjectPayload & {token: string; reviewerToken: string}>("/api/shared-projects", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({project})});
  return {session: {id: result.id, token: result.token, reviewerToken: result.reviewerToken, revision: result.revision, role: "editor"}, payload: result};
};
export const fetchSharedProject = (session: SharedProjectSession) => request<SharedProjectPayload>(`/api/shared-projects/${session.id}`, authenticated(session, "GET"));
export const updateSharedProject = (session: SharedProjectSession, project: EditorProject) => request<SharedProjectPayload>(`/api/shared-projects/${session.id}`, authenticated(session, "PUT", {baseRevision: session.revision, project}));
export const updateSharedComments = (session: SharedProjectSession, comments: ReviewComment[]) => request<SharedProjectPayload>(`/api/shared-projects/${session.id}/comments`, authenticated(session, "PUT", {comments}));
export const appendSharedComment = (session: SharedProjectSession, comment: ReviewComment) => request<SharedProjectPayload>(`/api/shared-projects/${session.id}/comments`, authenticated(session, "POST", {comment}));
