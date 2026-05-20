import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";

export interface LambdaEnv {
  functionName: string;
  memoryMB: number;
}

export interface EventBody {
  body?: string;
  isBase64Encoded: boolean;
}

const TEXT_CONTENT_TYPE_RE =
  /^(text\/|application\/(json|xml|x-www-form-urlencoded|javascript|graphql))/i;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// API Gateway v2 uses Apache CLF: "dd/MMM/yyyy:HH:mm:ss +0000"
function formatApigwTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${pad(d.getUTCDate())}/${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}:` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`
  );
}

export function classifyBody(buf: Buffer, contentType: string): EventBody {
  if (buf.length === 0) return { isBase64Encoded: false };
  if (TEXT_CONTENT_TYPE_RE.test(contentType)) {
    return { body: buf.toString("utf8"), isBase64Encoded: false };
  }
  return { body: buf.toString("base64"), isBase64Encoded: true };
}

export async function readBody(req: IncomingMessage): Promise<EventBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const buf = Buffer.concat(chunks);
  const ct = String(req.headers["content-type"] ?? "");
  return classifyBody(buf, ct);
}

export interface BuildEventInput {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  sourceIp?: string;
  body?: EventBody;
}

export function buildEvent(input: BuildEventInput): APIGatewayProxyEventV2 {
  const url = new URL(input.url, "http://localhost");
  const headers: Record<string, string> = {};
  const cookies: string[] = [];
  for (const [k, v] of Object.entries(input.headers)) {
    if (v === undefined) continue;
    const lk = k.toLowerCase();
    if (lk === "cookie") {
      const raw = Array.isArray(v) ? v.join("; ") : v;
      cookies.push(...raw.split(/;\s*/));
      continue;
    }
    headers[lk] = Array.isArray(v) ? v.join(", ") : v;
  }

  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    queryStringParameters[k] = v;
  });

  const now = new Date();
  const body = input.body ?? { isBase64Encoded: false };

  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: url.pathname,
    rawQueryString: url.searchParams.toString(),
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
        method: input.method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: input.sourceIp ?? "127.0.0.1",
        userAgent: headers["user-agent"] ?? "",
      },
      requestId: randomUUID(),
      routeKey: "$default",
      stage: "$default",
      time: formatApigwTime(now),
      timeEpoch: now.getTime(),
    },
    body: body.body,
    isBase64Encoded: body.isBase64Encoded,
  };
}

export interface BuildContextInput {
  deadline: number;
  env: LambdaEnv;
  requestId?: string;
}

export function buildContext(input: BuildContextInput): Context {
  const requestId = input.requestId ?? randomUUID();
  return {
    callbackWaitsForEmptyEventLoop: true,
    functionName: input.env.functionName,
    functionVersion: "$LATEST",
    invokedFunctionArn: `arn:aws:lambda:local:000000000000:function:${input.env.functionName}`,
    memoryLimitInMB: String(input.env.memoryMB),
    awsRequestId: requestId,
    logGroupName: `/aws/lambda/${input.env.functionName}`,
    logStreamName: `${new Date().toISOString().slice(0, 10)}/[$LATEST]${requestId.replace(/-/g, "")}`,
    getRemainingTimeInMillis: () => Math.max(0, input.deadline - Date.now()),
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}
