import { bunRuntime } from "../../../src/runtime/bun/index.js";
import { earlyResponseHandler } from "../early-response-app.ts";

const handler = earlyResponseHandler();
const server = await bunRuntime.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) => handler(request),
});
process.send?.({ port: server.port });
process.once("SIGTERM", () => {
  void server.stop(true).then(() => process.exit(0));
});
