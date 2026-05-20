import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Context } from "aws-lambda";
import { handler } from "./index";

const eventArg = process.argv[2];
if (!eventArg) {
  console.error("Usage: npm run invoke -- <path-to-event.json>");
  process.exit(1);
}

const eventPath = resolve(process.cwd(), eventArg);
const event = JSON.parse(readFileSync(eventPath, "utf8"));

const TIMEOUT_MS = Number(process.env.LAMBDA_TIMEOUT_MS ?? 3000);
const MEMORY_MB = Number(process.env.LAMBDA_MEMORY_MB ?? 128);
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME ?? "hono-playground";

const startedAt = Date.now();
const deadline = startedAt + TIMEOUT_MS;
const requestId = randomUUID();

const context: Context = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: FUNCTION_NAME,
  functionVersion: "$LATEST",
  invokedFunctionArn: `arn:aws:lambda:local:000000000000:function:${FUNCTION_NAME}`,
  memoryLimitInMB: String(MEMORY_MB),
  awsRequestId: requestId,
  logGroupName: `/aws/lambda/${FUNCTION_NAME}`,
  logStreamName: `${new Date().toISOString().slice(0, 10)}/[$LATEST]${requestId.replace(/-/g, "")}`,
  getRemainingTimeInMillis: () => Math.max(0, deadline - Date.now()),
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

console.log(`START RequestId: ${requestId}`);

let timeoutTimer: NodeJS.Timeout | undefined;
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

try {
  const result = await Promise.race([
    handler(event, context, () => {}),
    timeout,
  ]);
  clearTimeout(timeoutTimer);
  const duration = Date.now() - startedAt;
  console.log(`END RequestId: ${requestId}`);
  console.log(
    `REPORT RequestId: ${requestId}\tDuration: ${duration} ms\tMemory: ${MEMORY_MB} MB`,
  );
  console.log("--- response ---");
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  clearTimeout(timeoutTimer);
  const e = err as Error;
  console.error(`ERROR\t${e.name}: ${e.message}`);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}
