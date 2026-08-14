import type {EditorProject} from "../types";

export type ReviewReply = {
  id: string;
  author: string;
  body: string;
  createdAt: number;
};

export type ReviewComment = {
  id: string;
  sequenceId: string;
  frame: number;
  endFrame?: number;
  author: string;
  body: string;
  status: "open" | "resolved";
  createdAt: number;
  updatedAt: number;
  replies: ReviewReply[];
};

export type ProjectVersionSnapshot = {
  id: string;
  revision: number;
  parentRevision?: number;
  author: string;
  label?: string;
  createdAt: number;
  checksum: string;
  project: EditorProject;
};

export type SemanticChangeCategory = "added" | "removed" | "settings" | "moved" | "trimmed" | "retimed" | "source" | "effects" | "text" | "audio" | "content";

export type SemanticChange = {
  entityType: "project" | "sequence" | "track" | "clip" | "marker" | "transition" | "media";
  entityId: string;
  sequenceId?: string;
  category: SemanticChangeCategory;
  label: string;
  before?: unknown;
  after?: unknown;
};

export type ThreeWayConflict = {
  entityType: string;
  entityId: string;
  sequenceId?: string;
  path: string;
  reason: "divergent-edit" | "delete-vs-edit";
  base: unknown;
  local: unknown;
  remote: unknown;
};
