import { describe, expect, it } from "vitest";
import { buildContext, buildEvent, classifyBody } from "../src/emulator-core";

describe("buildEvent", () => {
  it("sets rawPath and rawQueryString from URL", () => {
    const event = buildEvent({
      method: "GET",
      url: "/entry/1?foo=bar&baz=qux",
      headers: {},
    });
    expect(event.rawPath).toBe("/entry/1");
    expect(event.rawQueryString).toBe("foo=bar&baz=qux");
    expect(event.queryStringParameters).toEqual({ foo: "bar", baz: "qux" });
  });

  it("omits queryStringParameters when no query", () => {
    const event = buildEvent({ method: "GET", url: "/", headers: {} });
    expect(event.queryStringParameters).toBeUndefined();
    expect(event.rawQueryString).toBe("");
  });

  it("splits cookies on ; or ;<space>", () => {
    const event = buildEvent({
      method: "GET",
      url: "/",
      headers: { cookie: "a=1;b=2; c=3" },
    });
    expect(event.cookies).toEqual(["a=1", "b=2", "c=3"]);
  });

  it("omits cookies when none provided", () => {
    const event = buildEvent({ method: "GET", url: "/", headers: {} });
    expect(event.cookies).toBeUndefined();
  });

  it("captures method and userAgent in requestContext.http", () => {
    const event = buildEvent({
      method: "POST",
      url: "/x",
      headers: { "user-agent": "test/1.0" },
      sourceIp: "10.0.0.1",
    });
    expect(event.requestContext.http.method).toBe("POST");
    expect(event.requestContext.http.userAgent).toBe("test/1.0");
    expect(event.requestContext.http.sourceIp).toBe("10.0.0.1");
  });

  it("joins multi-value headers with comma", () => {
    const event = buildEvent({
      method: "GET",
      url: "/",
      headers: { "x-multi": ["a", "b"] },
    });
    expect(event.headers["x-multi"]).toBe("a, b");
  });

  it("forwards body and isBase64Encoded", () => {
    const event = buildEvent({
      method: "POST",
      url: "/",
      headers: {},
      body: { body: "aGVsbG8=", isBase64Encoded: true },
    });
    expect(event.body).toBe("aGVsbG8=");
    expect(event.isBase64Encoded).toBe(true);
  });
});

describe("classifyBody", () => {
  it("returns isBase64Encoded:false for empty buffer", () => {
    expect(classifyBody(Buffer.alloc(0), "")).toEqual({
      isBase64Encoded: false,
    });
  });

  it("returns utf8 string for application/json", () => {
    const buf = Buffer.from('{"a":1}', "utf8");
    expect(classifyBody(buf, "application/json")).toEqual({
      body: '{"a":1}',
      isBase64Encoded: false,
    });
  });

  it("returns utf8 string for text/plain", () => {
    expect(classifyBody(Buffer.from("hi", "utf8"), "text/plain")).toEqual({
      body: "hi",
      isBase64Encoded: false,
    });
  });

  it("returns base64 for binary content-type", () => {
    const buf = Buffer.from([0x00, 0x01, 0xff]);
    expect(classifyBody(buf, "application/octet-stream")).toEqual({
      body: buf.toString("base64"),
      isBase64Encoded: true,
    });
  });

  it("returns base64 for image/png", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(classifyBody(buf, "image/png")).toEqual({
      body: buf.toString("base64"),
      isBase64Encoded: true,
    });
  });
});

describe("buildContext", () => {
  it("uses the provided requestId when given", () => {
    const ctx = buildContext({
      deadline: Date.now() + 1000,
      env: { functionName: "f", memoryMB: 256 },
      requestId: "fixed-id",
    });
    expect(ctx.awsRequestId).toBe("fixed-id");
  });

  it("getRemainingTimeInMillis decreases over time and bottoms at 0", async () => {
    const deadline = Date.now() + 50;
    const ctx = buildContext({
      deadline,
      env: { functionName: "f", memoryMB: 128 },
    });
    const initial = ctx.getRemainingTimeInMillis();
    expect(initial).toBeGreaterThan(0);
    expect(initial).toBeLessThanOrEqual(50);

    await new Promise((r) => setTimeout(r, 100));
    expect(ctx.getRemainingTimeInMillis()).toBe(0);
  });

  it("builds expected ARN and log group from functionName", () => {
    const ctx = buildContext({
      deadline: Date.now() + 1000,
      env: { functionName: "my-fn", memoryMB: 512 },
    });
    expect(ctx.invokedFunctionArn).toBe(
      "arn:aws:lambda:local:000000000000:function:my-fn",
    );
    expect(ctx.logGroupName).toBe("/aws/lambda/my-fn");
    expect(ctx.memoryLimitInMB).toBe("512");
  });
});
