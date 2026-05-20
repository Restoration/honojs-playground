import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../src/index";
import { buildContext } from "../src/emulator-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = resolve(HERE, "../events");

function loadEvent<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(resolve(EVENTS_DIR, name), "utf8")) as T;
}

function makeContext() {
  return buildContext({
    deadline: Date.now() + 3000,
    env: { functionName: "test", memoryMB: 128 },
  });
}

async function invoke(eventFile: string) {
  const event = loadEvent(eventFile);
  const ctx = makeContext();
  const result = (await handler(
    event as never,
    ctx,
    () => {},
  )) as APIGatewayProxyStructuredResultV2;
  return result;
}

describe("Lambda handler via sample events", () => {
  it("APIGW v2: GET / returns text greeting", async () => {
    const res = await invoke("apigw-v2-get-root.json");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("Hello Hono on Lambda!");
  });

  it("APIGW v2: GET /entry/1 returns post JSON", async () => {
    const res = await invoke("apigw-v2-get-entry.json");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? "{}")).toEqual({
      id: "1",
      title: "blog1",
      content: "content1",
    });
  });

  it("APIGW v2: GET /entry/999 returns 404", async () => {
    const res = await invoke("apigw-v2-get-entry-notfound.json");
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "not found" });
  });

  it("APIGW v1: GET /entry/1 also works (auto-detected)", async () => {
    const res = await invoke("apigw-v1-get-entry.json");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? "{}")).toMatchObject({ id: "1" });
  });

  it("Function URL: GET /entry/2 works (same shape as v2)", async () => {
    const res = await invoke("function-url-get-entry.json");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? "{}")).toMatchObject({ id: "2" });
  });
});
