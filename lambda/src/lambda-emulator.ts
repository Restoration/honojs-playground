import { createServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda";
import { handler } from "./index";

const PORT = Number(process.env.PORT ?? 3000);
const TIMEOUT_MS = Number(process.env.LAMBDA_TIMEOUT_MS ?? 3000);
const MEMORY_MB = Number(process.env.LAMBDA_MEMORY_MB ?? 128);
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME ?? "hono-playground";
const COLD_START_DELAY_MS = Number(process.env.LAMBDA_COLD_START_MS ?? 0);

let invocationCount = 0;

async function readBody(
  req: IncomingMessage,
): Promise<{ body?: string; isBase64Encoded: boolean }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return { isBase64Encoded: false };
  const buf = Buffer.concat(chunks);
  const ct = String(req.headers["content-type"] ?? "");
  const isText =
    /^(text\/|application\/(json|xml|x-www-form-urlencoded|javascript|graphql))/i.test(
      ct,
    );
  if (isText) return { body: buf.toString("utf8"), isBase64Encoded: false };
  return { body: buf.toString("base64"), isBase64Encoded: true };
}

function buildEvent(
  req: IncomingMessage,
  body: { body?: string; isBase64Encoded: boolean },
): APIGatewayProxyEventV2 {
  const url = new URL(req.url ?? "/", "http://localhost");
  const headers: Record<string, string> = {};
  const cookies: string[] = [];
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (k.toLowerCase() === "cookie") {
      const raw = Array.isArray(v) ? v.join("; ") : v;
      cookies.push(...raw.split("; "));
      continue;
    }
    headers[k] = Array.isArray(v) ? v.join(", ") : v;
  }

  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    queryStringParameters[k] = v;
  });

  const now = new Date();
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: url.pathname,
    rawQueryString: url.search.replace(/^\?/, ""),
    cookies: cookies.length ? cookies : undefined,
    headers,
    queryStringParameters: Object.keys(queryStringParameters).length
      ? queryStringParameters
      : undefined,
    requestContext: {
      accountId: "000000000000",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method: req.method ?? "GET",
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: req.socket.remoteAddress ?? "127.0.0.1",
        userAgent: headers["user-agent"] ?? "",
      },
      requestId: randomUUID(),
      routeKey: "$default",
      stage: "$default",
      time: now.toUTCString(),
      timeEpoch: now.getTime(),
    },
    body: body.body,
    isBase64Encoded: body.isBase64Encoded,
  };
}

function buildContext(): Context {
  const startedAt = Date.now();
  const requestId = randomUUID();
  return {
    callbackWaitsForEmptyEventLoop: true,
    functionName: FUNCTION_NAME,
    functionVersion: "$LATEST",
    invokedFunctionArn: `arn:aws:lambda:local:000000000000:function:${FUNCTION_NAME}`,
    memoryLimitInMB: String(MEMORY_MB),
    awsRequestId: requestId,
    logGroupName: `/aws/lambda/${FUNCTION_NAME}`,
    logStreamName: `${new Date().toISOString().slice(0, 10)}/[$LATEST]${requestId.replace(/-/g, "")}`,
    getRemainingTimeInMillis: () =>
      Math.max(0, TIMEOUT_MS - (Date.now() - startedAt)),
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

const server = createServer(async (req, res) => {
  const wallStart = Date.now();
  invocationCount += 1;
  const isColdStart = invocationCount === 1;

  if (isColdStart && COLD_START_DELAY_MS > 0) {
    await new Promise((r) => setTimeout(r, COLD_START_DELAY_MS));
  }

  let context: Context | undefined;
  try {
    const body = await readBody(req);
    const event = buildEvent(req, body);
    context = buildContext();

    console.log(
      `START RequestId: ${context.awsRequestId} Version: $LATEST${
        isColdStart ? "  (cold start)" : ""
      }`,
    );

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `Task timed out after ${(TIMEOUT_MS / 1000).toFixed(2)} seconds`,
            ),
          ),
        TIMEOUT_MS,
      );
    });

    const result = (await Promise.race([
      handler(event, context, () => {}),
      timeout,
    ])) as APIGatewayProxyStructuredResultV2;

    const duration = Date.now() - wallStart;
    console.log(`END RequestId: ${context.awsRequestId}`);
    console.log(
      `REPORT RequestId: ${context.awsRequestId}\tDuration: ${duration} ms\tMemory Size: ${MEMORY_MB} MB`,
    );

    res.statusCode = result.statusCode ?? 200;
    for (const [k, v] of Object.entries(result.headers ?? {})) {
      if (v !== undefined && v !== null) res.setHeader(k, String(v));
    }
    if (result.cookies) {
      for (const c of result.cookies) res.appendHeader("set-cookie", c);
    }
    if (result.body !== undefined) {
      const payload = result.isBase64Encoded
        ? Buffer.from(result.body, "base64")
        : result.body;
      res.end(payload);
    } else {
      res.end();
    }
  } catch (err) {
    const e = err as Error;
    console.error(
      `${context ? context.awsRequestId : "-"}\tERROR\t${e.name}: ${e.message}`,
    );
    if (e.stack) console.error(e.stack);
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        errorMessage: e.message,
        errorType: e.name,
        stackTrace: (e.stack ?? "").split("\n"),
      }),
    );
  }
});

server.listen(PORT, () => {
  console.log(`Lambda emulator listening on http://localhost:${PORT}`);
  console.log(`  function     : ${FUNCTION_NAME}`);
  console.log(`  timeout      : ${TIMEOUT_MS} ms`);
  console.log(`  memory       : ${MEMORY_MB} MB`);
  if (COLD_START_DELAY_MS > 0) {
    console.log(`  cold start   : +${COLD_START_DELAY_MS} ms on first invoke`);
  }
});
