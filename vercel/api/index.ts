import { Hono } from "hono";
import { handle } from "hono/vercel";
import { prettyJSON } from "hono/pretty-json";

export const config = {
  runtime: "edge",
};

const blogPosts = [
  { id: "1", title: "blog1", content: "content1" },
  { id: "2", title: "blog2", content: "content2" },
  { id: "3", title: "blog3", content: "content3" },
];

const app = new Hono().basePath("/api");

app.use("/entry/*", prettyJSON());

app.get("/", (c) => c.text("Hello Hono!"));

app.get("/entry/:id", (c) => {
  const id = c.req.param("id");
  const post = blogPosts.find((p) => p.id === id);
  if (!post) return c.json({ error: "not found" }, 404);
  return c.json(post);
});

export default handle(app);
