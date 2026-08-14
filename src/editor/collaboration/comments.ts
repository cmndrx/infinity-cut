import type {ReviewComment, ReviewReply} from "./types";

let fallbackId = 0;
const id = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${fallbackId++}`;
const requiredText = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  if (trimmed.length > 10_000) throw new Error(`${label} is too long`);
  return trimmed;
};

export const createReviewComment = (input: {sequenceId: string; frame: number; endFrame?: number; author: string; body: string; now?: number; id?: string}): ReviewComment => {
  const frame = Math.max(0, Math.round(input.frame));
  const endFrame = input.endFrame === undefined ? undefined : Math.max(frame, Math.round(input.endFrame));
  const now = input.now ?? Date.now();
  return {id: input.id ?? id("comment"), sequenceId: requiredText(input.sequenceId, "Sequence"), frame, endFrame, author: requiredText(input.author, "Author"), body: requiredText(input.body, "Comment"), status: "open", createdAt: now, updatedAt: now, replies: []};
};

export const replyToReviewComment = (comment: ReviewComment, input: {author: string; body: string; now?: number; id?: string}): ReviewComment => {
  const now = input.now ?? Date.now();
  const reply: ReviewReply = {id: input.id ?? id("reply"), author: requiredText(input.author, "Author"), body: requiredText(input.body, "Reply"), createdAt: now};
  return {...comment, updatedAt: now, replies: [...comment.replies, reply]};
};

export const setReviewCommentResolved = (comment: ReviewComment, resolved: boolean, now = Date.now()): ReviewComment => ({...comment, status: resolved ? "resolved" : "open", updatedAt: now});
