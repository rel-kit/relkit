/** Small Docker and HTTP polling helpers shared by the production image tests. */

/**
 * Runs one Docker command with inherited output.
 * @param args - Docker arguments.
 * @returns Exit code.
 */
export async function docker(args: readonly string[]): Promise<number> {
  const child = Bun.spawn(["docker", ...args], { stdout: "ignore", stderr: "inherit" });
  return child.exited;
}

/**
 * Runs one Docker command and captures its standard output.
 * @param args - Docker arguments.
 * @returns Trimmed standard output.
 */
export async function dockerOutput(args: readonly string[]): Promise<string> {
  const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(child.stdout).text();
  await child.exited;
  return text.trim();
}

/**
 * Reads a container's combined log output.
 * @param name - Container name.
 * @returns Standard output and standard error.
 */
export async function containerLogs(name: string): Promise<string> {
  const child = Bun.spawn(["docker", "logs", name], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  return out + err;
}

/** @returns A random high port for a published container port. */
export function freePort(): number {
  return 30_000 + Math.floor(Math.random() * 20_000);
}

/**
 * Polls a URL until it answers with the expected status.
 * @param url - Probe URL.
 * @param status - Expected status.
 * @param attempts - Half-second attempts; one minute by default.
 * @returns Whether the status was observed.
 */
export async function waitForStatus(url: string, status: number, attempts = 120): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const observed = await fetch(url).then(
      (response) => response.status,
      () => 0,
    );
    if (observed === status) return true;
    await Bun.sleep(500);
  }
  return false;
}
