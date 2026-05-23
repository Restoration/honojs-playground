import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { validator } from "hono/validator";
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  patchPost,
  replacePost,
} from "./store";

export const app = new Hono();

app.use("/posts", prettyJSON());
app.use("/posts/*", prettyJSON());

app.get("/", (c) => c.text("Hello Hono REST API!"));

app.get("/posts", (c) => c.json(listPosts()));

app.get("/posts/:id", (c) => {
  const post = getPost(c.req.param("id"));
  if (!post) return c.json({ error: "not found" }, 404);
  return c.json(post);
});

const fullBody = validator("json", (value, c) => {
  if (typeof value !== "object" || value === null) {
    return c.json({ error: "body must be a JSON object" }, 400);
  }
  const { title, content } = value as Record<string, unknown>;
  if (typeof title !== "string" || title.trim() === "") {
    return c.json({ error: "title must be a non-empty string" }, 400);
  }
  if (typeof content !== "string" || content.trim() === "") {
    return c.json({ error: "content must be a non-empty string" }, 400);
  }
  return { title, content };
});

const partialBody = validator("json", (value, c) => {
  if (typeof value !== "object" || value === null) {
    return c.json({ error: "body must be a JSON object" }, 400);
  }
  const { title, content } = value as Record<string, unknown>;
  if (title === undefined && content === undefined) {
    return c.json(
      { error: "at least one of title/content is required" },
      400,
    );
  }
  if (
    title !== undefined &&
    (typeof title !== "string" || title.trim() === "")
  ) {
    return c.json({ error: "title must be a non-empty string" }, 400);
  }
  if (
    content !== undefined &&
    (typeof content !== "string" || content.trim() === "")
  ) {
    return c.json({ error: "content must be a non-empty string" }, 400);
  }
  const out: { title?: string; content?: string } = {};
  if (typeof title === "string") out.title = title;
  if (typeof content === "string") out.content = content;
  return out;
});

app.post("/posts", fullBody, (c) => {
  const body = c.req.valid("json");
  const post = createPost(body);
  return c.json(post, 201);
});

app.put("/posts/:id", fullBody, (c) => {
  const body = c.req.valid("json");
  const post = replacePost(c.req.param("id"), body);
  if (!post) return c.json({ error: "not found" }, 404);
  return c.json(post);
});

app.patch("/posts/:id", partialBody, (c) => {
  const body = c.req.valid("json");
  const post = patchPost(c.req.param("id"), body);
  if (!post) return c.json({ error: "not found" }, 404);
  return c.json(post);
});

app.delete("/posts/:id", (c) => {
  const ok = deletePost(c.req.param("id"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.body(null, 204);
});
