/**
 * Prints the survey as a Markdown table: every position with what each editor shows, what a
 * developer expects, the verdict and the cause.
 *
 *   bun tests/editor/survey.ts
 */
import { EDITORS, FIXTURE } from "./drivers.js";
import { type Measurement, measure } from "./measure.js";
import { type Cause, PROBES } from "./probes/index.js";

/** One sentence per cause, as the table prints it. */
export const CAUSES: Readonly<Record<Cause, string>> = {
  typing: "Typing defect in RelKit: one type parameter is inferred from the whole options object.",
  "access-names":
    "The names exist only in the application's Better Auth file; no type carries them to `access`.",
  "captured-options":
    "Typing defect in RelKit: the options object is itself a type parameter, so extra keys are accepted.",
  overloads:
    "Typing in RelKit: the API is overloaded and the editor reads one overload; TypeScript's rule.",
  "nested-call":
    "TypeScript limitation: `http.input()` is a call of its own and does not see the route's input.",
  "profile-names":
    "The names exist only in `relkit.config.ts`; a descriptor file has no type that carries them.",
  "path-parameters":
    "The names exist only as folder names; `relkit check` compares them with the function's input.",
};

const cell = (text: string): string => text.replaceAll("|", "\\|").replaceAll("\n", " ");

/** Measures every position on every editor. */
async function run(): Promise<void> {
  const columns: { readonly name: string; readonly rows: readonly Measurement[] }[] = [];
  for (const [name, start] of Object.entries(EDITORS)) {
    const driver = await start();
    const rows: Measurement[] = [];
    for (const probe of PROBES) rows.push(await measure(driver, FIXTURE, probe));
    await driver.close();
    columns.push({ name, rows });
  }
  const head = ["Surface", "Position", "A developer expects", ...columns.map((c) => c.name)];
  console.log(`| ${[...head, "Verdict", "Cause"].join(" | ")} |`);
  console.log(`| ${[...head, "", ""].map(() => "---").join(" | ")} |`);
  PROBES.forEach((probe, index) => {
    const expects =
      probe.expect === undefined
        ? `one error that says ${(probe.error ?? []).map((part) => `\`${part}\``).join(", ")}`
        : probe.expect.map((name) => `\`${name}\``).join(", ");
    const verdicts = [...new Set(columns.map((column) => column.rows[index]!.verdict))];
    const row = [
      probe.surface,
      probe.position,
      expects,
      ...columns.map((column) => column.rows[index]!.shows),
      verdicts.join(" / "),
      probe.cause === undefined ? "" : CAUSES[probe.cause],
    ];
    console.log(`| ${row.map(cell).join(" | ")} |`);
  });
  for (const column of columns) {
    const counts = new Map<string, number>();
    for (const row of column.rows) counts.set(row.verdict, (counts.get(row.verdict) ?? 0) + 1);
    console.log(
      `\n${column.name}: ${PROBES.length} positions; ${[...counts].map(([verdict, count]) => `${count} ${verdict}`).join(", ")}.`,
    );
  }
}

if (import.meta.main) await run();
