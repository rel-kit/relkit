/** Development JSON logging remains usable without a UI process or local-store owner. */
import { expect, test } from "bun:test";
import { runCli } from "./src/main.js";
import { generatedAppFixture } from "../../tests/fixtures/inspector/generated-app.js";

/** Checks the native log contract independently of the fixture process lifetime. */
function assertJsonOutput(stdout: string[], stderr: string[]) {
  const records = stderr.map((line) => JSON.parse(line));
  expect(records.every((record) => record.version === 2 && record.signal === "log")).toBe(true);
  expect(records.some((record) => record.component === "runtime.http")).toBe(true);
  expect(records.some((record) => record.message === "dev.stopped")).toBe(true);
  expect(records.some((record) => record.message === "inspector.output")).toBe(false);
  expect(stdout.map((line) => JSON.parse(line))).toEqual([
    { ok: false, error: { code: "RELKIT_INTERRUPTED", message: "Operation interrupted." } },
  ]);
}

test("JSON dev reports native request logs and joined shutdown without starting a UI", async () => {
  const f = await generatedAppFixture();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const stdout: string[] = [];
  const stderr: string[] = [];
  let request: Promise<void> | undefined;
  try {
    await f.session.stop();
    const number = await availablePort();
    const exit = await runCli(
      [
        "dev",
        "--json",
        "--verbose",
        "--no-color",
        "--project-root",
        f.projectRoot,
        "--local",
        "off",
        "--port",
        String(number),
      ],
      {
        signal: controller.signal,
        installSignalHandlers: false,
        io: {
          stdout: (line) => stdout.push(line),
          stderr: (line) => {
            stderr.push(line);
            const record = JSON.parse(line);
            if (record.message === "dev.ready")
              request = fetch(record.fields.backend + "/hello")
                .then(async (response) => {
                  await response.text();
                  await Bun.sleep(150);
                })
                .finally(() => controller.abort());
          },
        },
      },
    );
    await request;
    expect(exit).toBe(130);
    assertJsonOutput(stdout, stderr);
  } finally {
    clearTimeout(timer);
    controller.abort();
    await f.close();
  }
}, 60_000);

/** Allocates one owned listener before the CLI starts. */
async function availablePort() {
  const port = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const number = port.port!;
  await port.stop(true);
  return number;
}
