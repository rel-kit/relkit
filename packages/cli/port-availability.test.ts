import { expect, test } from "bun:test";
import { assertPortAvailable } from "./src/commands/port-availability";

test("identifies occupied ports and their CLI override", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  try {
    await expect(assertPortAvailable(server.port, "127.0.0.1", "--port")).rejects.toThrow(
      new RegExp(`Port ${server.port} .* --port`),
    );
  } finally {
    await server.stop(true);
  }
});
