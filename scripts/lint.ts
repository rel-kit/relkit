import { resolve } from "node:path";
import { scanAuthoring } from "./authoring-scan";
import { authoringFragments } from "./authoring-scan-utils";

function main(): void {
  const root = resolve(process.argv[2] ?? resolve(import.meta.dir, ".."));
  const findings = scanAuthoring(root);
  for (const finding of findings)
    console.error(
      `${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message}`,
    );
  if (findings.length > 0)
    throw new Error(`Public authoring scan failed with ${findings.length} violation(s).`);
  console.log(
    `Public authoring scan passed (${authoringFragments(root).length} source/example fragments).`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
