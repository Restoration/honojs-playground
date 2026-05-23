import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { clearPosts } from "../src/store";

beforeEach(() => {
  clearPosts();
});

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("REST API: root + GET", () => {
  it("GET / returns greeting", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Hello Hono REST API!");
  });

  it("GET /posts returns empty list initially", async () => {
    const res = await app.request("/posts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("GET /posts/:id returns 404 when not found", async () => {
    const res = await app.request("/posts/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});

describe("REST API: POST", () => {
  it("creates a post and returns 201", async () => {
    const res = await app.request(
      "/posts",
      json({ title: "t1", content: "c1" }),
    );
    expect(res.status).toBe(201);
    const post = (await res.json()) as {
      id: string;
      title: string;
      content: string;
      createdAt: number;
      updatedAt: number;
    };
    expect(post.title).toBe("t1");
    expect(post.content).toBe("c1");
    expect(typeof post.id).toBe("string");
    expect(post.createdAt).toBe(post.updatedAt);
  });

  it("rejects missing title with 400", async () => {
    const res = await app.request("/posts", json({ content: "c" }));
    expect(res.status).toBe(400);
  });

  it("rejects empty content with 400", async () => {
    const res = await app.request("/posts", json({ title: "t", content: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects non-object body with 400", async () => {
    const res = await app.request("/posts", json(["x"]));
    expect(res.status).toBe(400);
  });
});

describe("REST API: full lifecycle", () => {
  it("create → get → list → patch → put → delete", async () => {
    const created = (await (
      await app.request("/posts", json({ title: "orig", content: "orig c" }))
    ).json()) as { id: string };
    const id = created.id;

    const got = await app.request(`/posts/${id}`);
    expect(got.status).toBe(200);
    expect(((await got.json()) as { title: string }).title).toBe("orig");

    const list = (await (await app.request("/posts")).json()) as unknown[];
    expect(list).toHaveLength(1);

    const patched = await app.request(`/posts/${id}`, {
      ...json({ title: "patched" }),
      method: "PATCH",
    });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as {
      title: string;
      content: string;
    };
    expect(patchedBody.title).toBe("patched");
    expect(patchedBody.content).toBe("orig c");

    const put = await app.request(`/posts/${id}`, {
      ...json({ title: "replaced", content: "replaced c" }),
      method: "PUT",
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { content: string }).content).toBe(
      "replaced c",
    );

    const del = await app.request(`/posts/${id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const after = await app.request(`/posts/${id}`);
    expect(after.status).toBe(404);
  });
});

describe("REST API: PATCH", () => {
  it("requires at least one field", async () => {
    const { id } = (await (
      await app.request("/posts", json({ title: "t", content: "c" }))
    ).json()) as { id: string };

    const res = await app.request(`/posts/${id}`, {
      ...json({}),
      method: "PATCH",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when id missing", async () => {
    const res = await app.request("/posts/nope", {
      ...json({ title: "x" }),
      method: "PATCH",
    });
    expect(res.status).toBe(404);
  });
});

describe("REST API: PUT", () => {
  it("returns 404 when id missing", async () => {
    const res = await app.request("/posts/nope", {
      ...json({ title: "x", content: "y" }),
      method: "PUT",
    });
    expect(res.status).toBe(404);
  });
});

describe("REST API: DELETE", () => {
  it("returns 404 when id missing", async () => {
    const res = await app.request("/posts/nope", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
