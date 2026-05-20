import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";

const blogPosts = [
  { id: "1", title: "blog1", content: "content1" },
  { id: "2", title: "blog2", content: "content2" },
  { id: "3", title: "blog3", content: "content3" },
];

export const app = new Hono();

app.use("*", prettyJSON());

app.get("/", (c) => c.text("Hello Hono on Lambda!"));

app.get("/entry/:id", (c) => {
  const id = c.req.param("id");
  const post = blogPosts.find((p) => p.id === id);
  if (!post) return c.json({ error: "not found" }, 404);
  return c.json(post);
});
