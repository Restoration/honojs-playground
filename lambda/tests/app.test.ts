import { describe, expect, it } from "vitest";
import { app } from "../src/app";

describe("Hono app (runtime-agnostic)", () => {
  it("GET / returns greeting text", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Hello Hono on Lambda!");
  });

  it("GET /entry/:id returns the post when found", async () => {
    const res = await app.request("/entry/1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "1",
      title: "blog1",
      content: "content1",
    });
  });

  it("GET /entry/:id returns 404 for unknown id", async () => {
    const res = await app.request("/entry/999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("unknown route returns 404", async () => {
    const res = await app.request("/no-such-route");
    expect(res.status).toBe(404);
  });
});
