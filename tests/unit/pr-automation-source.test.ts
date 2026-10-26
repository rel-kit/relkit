/** Exercises trusted changeset planning against real PR Git objects while the working tree remains at the base commit. */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import {
  preparedChangeset,
  regularGitFiles,
  verifyEvidenceRestoration,
} from "../../scripts/pr-automation-source.ts";
import { withAutomationRepository } from "./pr-automation-fixture.ts";

const signal = new AbortController().signal;
const archived = "openspec/changes/archive/example/app/package.json";

test("trusted changesets read PR manifests and preserve manual bumps without executing PR scripts", async () => {
  await withAutomationRepository(
    {
      "packages/schema/package.json": JSON.stringify({ name: "@relkit/schema" }),
      "packages/schema/src/index.ts": "export const value = 1;\n",
      "scripts/hostile.ts": "// base\n",
    },
    async ({ root, base, git, write, commit }) => {
      await write("packages/schema/src/index.ts", "export const value = 2;\n");
      await write("packages/new/package.json", JSON.stringify({ name: "@relkit/new" }));
      await write(
        ".changeset/manual.md",
        '---\n"@relkit/schema": minor\n---\n\nPreserve the chosen bump.\n',
      );
      await write("scripts/hostile.ts", 'await Bun.write("executed", "unsafe");\n');
      await symlink("scripts/hostile.ts", join(root, "symlink.ts"));
      const head = commit();
      git("checkout", "--quiet", "--detach", base);
      const branch = { sha: head, ref: "feature", repo: { full_name: "rel-kit/relkit" } };
      const pull = {
        number: 42,
        title: "Schema update",
        state: "open",
        user: { login: "author" },
        head: branch,
        base: { ...branch, sha: base, ref: "main" },
      };
      const files = await regularGitFiles(root, head, signal);
      expect(files.has("symlink.ts")).toBe(false);
      const result = await preparedChangeset(root, pull, files, [], signal);
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toContain('"@relkit/new": patch');
      expect(result[0]!.content).not.toContain('"@relkit/schema"');
      expect(existsSync(join(root, "executed"))).toBe(false);
      expect(git("rev-parse", "HEAD")).toBe(base);
      git("checkout", "--quiet", "--detach", head);
      await write(result[0]!.path, result[0]!.content);
      const prepared = commit();
      git("checkout", "--quiet", "--detach", base);
      expect(
        await preparedChangeset(
          root,
          { ...pull, head: { ...branch, sha: prepared } },
          await regularGitFiles(root, prepared, signal),
          [],
          signal,
        ),
      ).toEqual([]);
    },
  );
});

test("archive corrections must restore the original bytes", async () => {
  const original = '{"next":"16.3.8"}\n';
  await withAutomationRepository(
    { [archived]: original },
    async ({ root, base, write, commit }) => {
      await write(archived, '{"next":"16.4.1"}\n');
      const head = commit();
      const branch = { sha: head, ref: "feature", repo: { full_name: "rel-kit/relkit" } };
      const pull = {
        number: 42,
        title: "Update",
        state: "open",
        user: { login: "dependabot[bot]" },
        head: branch,
        base: { ...branch, sha: base, ref: "main" },
      };
      await verifyEvidenceRestoration(root, pull, [{ path: archived, content: original }], signal);
      await expect(
        verifyEvidenceRestoration(
          root,
          pull,
          [{ path: archived, content: "altered evidence" }],
          signal,
        ),
      ).rejects.toThrow("Archived evidence");
    },
  );
});
