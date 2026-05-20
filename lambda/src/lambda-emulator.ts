import { createServer, type IncomingMessage } from "node:http";
import type {
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda";
import { handler } from "./index";
import {
  buildContext,
  buildEvent,
  readBody,
  type EventBody,
} from "./emulator-core";

const PORT = Number(process.env.PORT ?? 3000);
const TIMEOUT_MS = Number(process.env.LAMBDA_TIMEOUT_MS ?? 3000);
const MEMORY_MB = Number(process.env.LAMBDA_MEMORY_MB ?? 128);
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME ?? "hono-playground";
const COLD_START_DELAY_MS = Number(process.env.LAMBDA_COLD_START_MS ?? 0);

let coldStartPending = true;

function buildEventFromReq(req: IncomingMessage, body: EventBody) {
  return buildEvent({
    method: req.method ?? "GET",
    url: req.url ?? "/",
    headers: req.headers,
    sourceIp: req.socket.remoteAddress ?? "127.0.0.1",
    body,
  });
}

const server = createServer(async (req, res) => {
  const wallStart = Date.now();
  const isColdStart = coldStartPending;

  if (isColdStart && COLD_START_DELAY_MS > 0) {
    await new Promise((r) => setTimeout(r, COLD_START_DELAY_MS));
  }

  let context: Context | undefined;
  let timeoutTimer: NodeJS.Timeout | undefined;
  try {
    const body = await readBody(req);
    const event = buildEventFromReq(req, body);
    const deadline = Date.now() + TIMEOUT_MS;
    context = buildContext({
      deadline,
      env: { functionName: FUNCTION_NAME, memoryMB: MEMORY_MB },
    });

    console.log(
      `START RequestId: ${context.awsRequestId} Version: $LATEST${
        isColdStart ? "  (cold start)" : ""
      }`,
    );

    const timeout = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(
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

    clearTimeout(timeoutTimer);
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
    clearTimeout(timeoutTimer);
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
  } finally {
    // Any handler invocation (success or failure) warms the container.
    coldStartPending = false;
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
