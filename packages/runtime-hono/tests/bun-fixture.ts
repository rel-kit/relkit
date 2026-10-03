import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

/** A native Bun process owned and asserted by the calling Vitest test. */
export interface BunFixture {
  readonly port: number;
  readonly child: ChildProcess;
  readonly stop: () => Promise<void>;
}

/** Starts a server fixture and always tears it down if startup fails. */
export async function startBunFixture(
  name: string,
  config: Readonly<Record<string, unknown>> = {},
): Promise<BunFixture> {
  const child = spawn("bun", [fileURLToPath(new URL(`./fixtures/${name}.ts`, import.meta.url))], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, NODE_ENV: "test", RELKIT_FIXTURE_CONFIG: JSON.stringify(config) },
  });
  let diagnostics = "";
  child.stdout?.resume();
  child.stderr?.on("data", (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-64 * 1024);
  });
  const stopped = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const stop = async (): Promise<void> => {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    const force = setTimeout(() => child.kill("SIGKILL"), 2_000);
    try {
      await stopped;
    } finally {
      clearTimeout(force);
    }
  };
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Bun fixture ${name} did not start. ${diagnostics}`)),
        15_000,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Bun fixture exited ${code}: ${diagnostics}`));
      });
      child.once("message", (value: unknown) => {
        clearTimeout(timer);
        if (
          value !== null &&
          typeof value === "object" &&
          "port" in value &&
          typeof value.port === "number"
        )
          resolve(value.port);
        else reject(new Error(`Invalid fixture startup message: ${JSON.stringify(value)}`));
      });
    });
    return { port, child, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
