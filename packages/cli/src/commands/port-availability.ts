export async function assertPortAvailable(
  port: number,
  hostname: string,
  override: "--port" | "--inspector-port",
): Promise<void> {
  if (port === 0) return;
  try {
    const probe = Bun.serve({ hostname, port, fetch: () => new Response() });
    await probe.stop(true);
  } catch (error) {
    if (!isAddressInUse(error)) throw error;
    const owner = await listeningProcess(port);
    throw new Error(
      `Port ${port} on ${hostname} is already in use by ${owner}. Stop it or choose another with ${override}.`,
      { cause: error },
    );
  }
}

async function listeningProcess(port: number): Promise<string> {
  try {
    const child = Bun.spawn(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    if (exitCode !== 0) return "another process (PID unavailable)";
    const columns = output.trim().split(/\r?\n/)[1]?.trim().split(/\s+/);
    return columns?.[0] !== undefined && columns[1] !== undefined
      ? `${columns[0]} (PID ${columns[1]})`
      : "another process (PID unavailable)";
  } catch {
    return "another process (PID unavailable)";
  }
}

function isAddressInUse(error: unknown): boolean {
  return (
    error instanceof Error &&
    (("code" in error && error.code === "EADDRINUSE") ||
      /address already in use/i.test(error.message))
  );
}
