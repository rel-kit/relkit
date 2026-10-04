import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { checkDocgenExamples, restoreExampleContext } from "../scripts/check-docgen-examples.js";

test("restores source-relative imports while keeping example names and expressions intact", () => {
  const code =
    'import { value } from "./values.js";\nexport { other } from "../other.js";\nconst next = import("./next.js");\nmissingBinding(value);';
  const restored = restoreExampleContext(code, "/project/src/domain/workflow.ts");
  expect(restored).toContain('from "/project/src/domain/values.js"');
  expect(restored).toContain('from "/project/src/other.js"');
  expect(restored).toContain('import("/project/src/domain/next.js")');
  expect(restored).toContain("missingBinding(value);");
  expect(restored).toEndWith("export {};\n");
});

test("the real compiler accepts restored imports and still rejects invalid examples", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-docgen-context-"));
  const source = join(root, "source");
  const examples = join(root, "examples");
  await mkdir(source);
  await mkdir(examples);
  const owner = join(source, "owner.ts");
  const example = join(examples, `0-${owner.replaceAll("/", "-")}-function-run-0.ts`);
  const project = join(examples, "tsconfig.json");
  const compiler = resolve(import.meta.dir, "../../../node_modules/.bin/tsc");
  try {
    await writeFile(owner, "export const owner = true;\n");
    await writeFile(join(source, "values.ts"), "export const value = 42;\n");
    await writeFile(
      project,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          skipLibCheck: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          types: [],
        },
        include: ["*.ts"],
      }),
    );
    await writeFile(
      example,
      'import { value } from "./values.js";\nconst result: number = value;\n',
    );
    expect(await checkDocgenExamples(["--noEmit", "--project", project], source, compiler)).toBe(0);
    expect(await readFile(example, "utf8")).toContain(join(source, "values.js"));
    await writeFile(
      example,
      'import { value } from "./values.js";\nconst result: string = value;\n',
    );
    expect(
      await checkDocgenExamples(["--noEmit", "--project", project], source, compiler),
    ).not.toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
