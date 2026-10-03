import { createObservabilityCollector } from "@relkit/observability";
import { createHttpSpanRuntime, instrumentHttpRequest } from "../../src/http-span.ts";
const collector = createObservabilityCollector();
const baseOptions = {
  observability: collector,
  generationId: "generation.bun",
  graphHash: "sha256:http-span-bun",
};
const spanRuntime = createHttpSpanRuntime(baseOptions);
const options = { ...baseOptions, spanRuntime };
let release!: () => void;
const server = Bun.serve({
  port: 0,
  fetch: (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/__fixture/records") return Response.json(collector.read());
    if (path === "/__fixture/release") {
      release();
      return new Response(null, { status: 204 });
    }
    if (path === "/__fixture/close") {
      spanRuntime.close();
      return new Response(null, { status: 204 });
    }
    return instrumentHttpRequest(request, options, () =>
      request.method === "HEAD"
        ? new Response(null, { status: 204 })
        : new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("first"));
                release = () => {
                  controller.enqueue(new TextEncoder().encode("second"));
                  controller.close();
                };
              },
            }),
          ),
    );
  },
});
process.send?.({ port: server.port });
process.once("SIGTERM", () => {
  spanRuntime.close();
  server.stop(true);
  process.exit(0);
});
