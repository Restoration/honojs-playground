// import { Hono } from 'hono'
// import { handle } from 'hono/vercel'

// export const config = {
//   runtime: 'edge'
// }

// const app = new Hono().basePath('/api')

// app.get('/', (c) => {
//   return c.json({ message: 'Hello Hono!' })
// })

// export default handle(app)


import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";

let blogPosts = [
  {
    id: "1",
    title: "blog1",
    content: "content1"
  },
  {
    id: "2",
    title: "blog2",
    content: "content2"
  },
  {
    id: "3",
    title: "blog3",
    content: "content3"
  }
]

const app = new Hono();
app.use("*", prettyJSON());

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/entry/:id", (c) => {
  const id = c.req.param("id");
  return c.json({
    "you id is": id,
  });
});

