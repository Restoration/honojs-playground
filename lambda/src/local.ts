import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `[native] Hono listening on http://localhost:${info.port} ` +
      `(Lambda layer bypassed — use \`npm run dev:emulator\` for event/context/timeout)`,
  );
});
