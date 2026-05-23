import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export type Post = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

type Row = {
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
};

const rowToPost = (row: Row): Post => ({
  id: row.id,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function listPosts(): Post[] {
  const rows = getDb()
    .prepare("SELECT * FROM posts ORDER BY created_at DESC")
    .all() as Row[];
  return rows.map(rowToPost);
}

export function getPost(id: string): Post | null {
  const row = getDb().prepare("SELECT * FROM posts WHERE id = ?").get(id) as
    | Row
    | undefined;
  return row ? rowToPost(row) : null;
}

export function createPost(input: { title: string; content: string }): Post {
  const now = Date.now();
  const post: Post = {
    id: randomUUID(),
    title: input.title,
    content: input.content,
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      "INSERT INTO posts (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(post.id, post.title, post.content, post.createdAt, post.updatedAt);
  return post;
}

export function replacePost(
  id: string,
  input: { title: string; content: string },
): Post | null {
  const existing = getPost(id);
  if (!existing) return null;
  const now = Date.now();
  getDb()
    .prepare(
      "UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?",
    )
    .run(input.title, input.content, now, id);
  return { ...existing, ...input, updatedAt: now };
}

export function patchPost(
  id: string,
  input: { title?: string; content?: string },
): Post | null {
  const existing = getPost(id);
  if (!existing) return null;
  const now = Date.now();
  const next = {
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
  };
  getDb()
    .prepare(
      "UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?",
    )
    .run(next.title, next.content, now, id);
  return { ...existing, ...next, updatedAt: now };
}

export function deletePost(id: string): boolean {
  const info = getDb().prepare("DELETE FROM posts WHERE id = ?").run(id);
  return info.changes > 0;
}

export function clearPosts(): void {
  getDb().exec("DELETE FROM posts");
}
