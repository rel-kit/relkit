// Runs the published runtime suite inside the runtime it is started on, against that runtime's
// adapter, and prints the report as JSON. Started by `runtime-adapters.test.ts` with `bun` and
// with `node`.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runConformance } from "@relkit/testing/conformance";
import { createRuntimeConformanceHarness } from "@relkit/testing/runtime-conformance";

const name = typeof process.versions.bun === "string" ? "bun" : "node";
const { [`${name}Runtime`]: adapter } = await import(`relkit/runtime/${name}`);
const path = join(process.env.RELKIT_FIXTURE_ROOT, "file.txt");
await writeFile(path, "conformance file");
const report = await runConformance(
  createRuntimeConformanceHarness({
    adapter,
    kind: "process",
    environment: { name: "RELKIT_FIXTURE_MARKER", value: process.env.RELKIT_FIXTURE_MARKER },
    file: { path, contents: "conformance file" },
    executable: process.execPath,
    resolveFrom: process.cwd(),
  }),
);
process.stdout.write(JSON.stringify(report));
process.exit(0);
