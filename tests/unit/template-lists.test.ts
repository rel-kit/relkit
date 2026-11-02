/** Keeps every public list of creation templates in step with the packaged template directories. */
import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { findCliHelp } from "../../packages/cli/src/cli-help-model.ts";
import { formatCreateHelp } from "../../packages/create-relkit/src/create-help.ts";
import { CREATE_TEMPLATES } from "../../packages/create-relkit/src/options.ts";

const root = resolve(import.meta.dir, "../..");

test("help, the README and the templates README list the same five templates", async () => {
  const directories = (await readdir(join(root, "templates/default/v1"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const lists = {
    parser: [...CREATE_TEMPLATES],
    "create-relkit --help": createRelkitHelp(),
    "relkit create --help": [
      ...(findCliHelp(["create"])?.options.find((option) => option.name === "template")?.values ??
        []),
    ],
    README: readmeTemplates(await readFile(join(root, "README.md"), "utf8")),
    "templates README": templatesReadme(
      await readFile(join(root, "templates/default/README.md"), "utf8"),
    ),
  };
  expect(directories).toEqual(["agent", "api", "fullstack", "minimal", "tasks"]);
  for (const [source, list] of Object.entries(lists))
    expect({ source, templates: [...list].sort() }).toEqual({ source, templates: directories });
});

function createRelkitHelp(): readonly string[] {
  const match = /--template <([^>]+)>/u.exec(formatCreateHelp());
  return match?.[1]?.split("|") ?? [];
}

function readmeTemplates(text: string): readonly string[] {
  const start = text.indexOf("- `templates/default/v1` contains");
  const bullet = text.slice(start, text.indexOf("\n- ", start + 1));
  return [...bullet.slice(bullet.indexOf("contains")).matchAll(/`([a-z]+)`/gu)].map(
    (match) => match[1]!,
  );
}

function templatesReadme(text: string): readonly string[] {
  return [...text.matchAll(/^- `([a-z]+)` —/gmu)].map((match) => match[1]!);
}
