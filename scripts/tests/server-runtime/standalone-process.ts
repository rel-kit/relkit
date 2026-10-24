/** Owns a real canonical production child and verifies readiness and signal cleanup. */
import { strict as assert } from "node:assert";

/** Fixture-only token authorizes the explicitly enabled production API-reference proof. */
export const PRODUCTION_PROOF_TOKEN = "production-proof-api-token";

/**
 * Runs the JavaScript entrypoint with an optional application behavior assertion.
 * @param root - Relocated application root containing its immutable build.
 * @param verify - Optional real request assertion after health admission.
 * @param environment - Explicit fixture application environment passed to the owned child.
 * @returns After the owned child and output readers have physically settled.
 */
export async function verifyStandaloneServer(
  root: string,
  verify: (url: string) => Promise<void> = async () => {},
  environment: Readonly<Record<string, string>> = {},
): Promise<void> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port;
  await probe.stop(true);
  const child = spawnStandalone(root, port, environment);
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  let passed = false;
  try {
    const url = `http://127.0.0.1:${port}`;
    const ready = await waitForReadiness(child, url);
    assert.equal(
      ready,
      true,
      child.exitCode === null ? "Standalone readiness timed out" : (await output).join("\n"),
    );
    await verify(url);
    child.kill("SIGTERM");
    assert.equal(await physicalExit(child, 5_000), 0, (await output).join("\n"));
    passed = true;
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await physicalExit(child, 2_000);
    }
    const logs = await output;
    if (!passed) console.error(logs.join("\n"));
  }
}

/**
 * Polls only the owned process's health listener within one fixed deadline.
 * @param child - Physically owned subprocess whose health or exit is being observed.
 * @param url - Actual allocated HTTP origin of the owned production server.
 * @returns Whether the owned server became ready before its deadline or physical exit.
 */
async function waitForReadiness(child: Bun.Subprocess, url: string): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${url}/_relkit/v1/health/ready`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return true;
    } catch {
      // The physically owned child has not bound its listener yet.
    }
    await Bun.sleep(25);
  }
  return false;
}

/**
 * Waits for the physically owned child with an explicit acceptance deadline.
 * @param child - Physically owned subprocess whose health or exit is being observed.
 * @param timeoutMs - Maximum physical shutdown wait in milliseconds.
 * @returns The physical exit code, rejecting when the shutdown deadline expires.
 */
export async function physicalExit(child: Bun.Subprocess, timeoutMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Standalone shutdown did not exit within ${timeoutMs}ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Starts only the owned canonical child with explicit fixture environment.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param port - Allocated host port used only by this fixture listener.
 * @param environment - Explicit fixture application environment passed to the owned child.
 * @returns The owned canonical JavaScript subprocess with captured output and explicit production environment.
 */
function spawnStandalone(
  root: string,
  port: number,
  environment: Readonly<Record<string, string>>,
) {
  return Bun.spawn([process.execPath, "run", "--no-env-file", ".relkit/build/server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      ...environment,
      BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
      NODE_PATH: "",
      NODE_ENV: "production",
      RELKIT_ENV: "production",
      PORT: String(port),
      RELKIT_INTERNAL_ENDPOINT_TOKEN: PRODUCTION_PROOF_TOKEN,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
}
