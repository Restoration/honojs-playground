import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { handler } from "./index";
import { buildContext } from "./emulator-core";

const eventArg = process.argv[2];
if (!eventArg) {
  console.error("Usage: npm run invoke -- <path-to-event.json>");
  process.exit(1);
}

const eventPath = resolve(process.cwd(), eventArg);
let event: unknown;
try {
  event = JSON.parse(readFileSync(eventPath, "utf8"));
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  if (e.code === "ENOENT") {
    console.error(`Event file not found: ${eventPath}`);
  } else {
    console.error(`Failed to read/parse ${eventPath}: ${e.message}`);
  }
  process.exit(1);
}

const TIMEOUT_MS = Number(process.env.LAMBDA_TIMEOUT_MS ?? 3000);
const MEMORY_MB = Number(process.env.LAMBDA_MEMORY_MB ?? 128);
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME ?? "hono-playground";

const startedAt = Date.now();
const deadline = startedAt + TIMEOUT_MS;
const context = buildContext({
  deadline,
  env: { functionName: FUNCTION_NAME, memoryMB: MEMORY_MB },
});

console.log(`START RequestId: ${context.awsRequestId}`);

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
    // event is read from disk; hono/aws-lambda handles v1/v2/Function URL union
    handler(event as never, context, () => {}),
    timeout,
  ]);
  clearTimeout(timeoutTimer);
  const duration = Date.now() - startedAt;
  console.log(`END RequestId: ${context.awsRequestId}`);
  console.log(
    `REPORT RequestId: ${context.awsRequestId}\tDuration: ${duration} ms\tMemory: ${MEMORY_MB} MB`,
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
