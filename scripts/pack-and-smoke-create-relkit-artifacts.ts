import { runCommand } from "./pack-and-smoke-create-relkit-support.js";

export async function addArtifacts(
  relkit: string,
  root: string,
  registry: string,
  cacheDir: string,
): Promise<void> {
  for (const args of [
    [
      "service",
      "Billing",
      ...(process.env.RELKIT_TEST_DOCKER === "1"
        ? ["--full"]
        : [
            "--include",
            "task",
            "--include",
            "job",
            "--include",
            "event",
            "--include",
            "agent",
            "--include",
            "route",
          ]),
    ],
    ...(process.env.RELKIT_TEST_DOCKER === "1" ? [["service", "Shipping", "--full"]] : []),
  ]) {
    const result = JSON.parse(
      await runCommand(
        [relkit, "--json", "add", ...args, "--project-root", root],
        root,
        registry,
        cacheDir,
      ),
    ) as { readonly ok?: boolean };
    if (result.ok !== true) throw new Error(`Packed add ${args[0]} did not succeed.`);
  }
}
