# lambda

Hono app packaged for AWS Lambda (API Gateway / Function URL).

## Layout

- `src/app.ts` — Hono app (routes only, runtime-agnostic)
- `src/index.ts` — Lambda entry point. Exports `handler` via `hono/aws-lambda`
- `src/local.ts` — Local Node server for development (`@hono/node-server`)

## Scripts

| script        | purpose                                              |
| ------------- | ---------------------------------------------------- |
| `npm run dev` | Run the app on `http://localhost:3000` via Node      |
| `npm run build`   | Bundle `src/index.ts` → `dist/index.cjs` (esbuild)   |
| `npm run package` | Build + zip into `function.zip` for Lambda upload  |

## Deploy notes

- Runtime: Node.js 20.x
- Handler: `index.handler`
- Compatible with API Gateway v1 / v2 and Lambda Function URLs (`hono/aws-lambda` auto-detects)
