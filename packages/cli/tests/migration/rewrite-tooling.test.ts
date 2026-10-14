/** Checks conservative literal-path rewrites without running operational scripts or interpreting prose. */
import { expect, test } from "vitest";
import { rewriteLayoutTooling } from "../../src/migration/layout-rewrite-tooling.js";

const moves = [{ from: "src/orders", to: "src/services/orders" }];

test("rewrites actual shell script operands while preserving comments and output payloads", () => {
  const before =
    '# src/orders/comment.ts\nbun src/orders/seed.ts\nprintf "%s" "src/orders/customer-data.txt"\n';
  const result = rewriteLayoutTooling("scripts/seed.sh", before, moves);
  expect(result.text).toBe(
    '# src/orders/comment.ts\nbun src/services/orders/seed.ts\nprintf "%s" "src/orders/customer-data.txt"\n',
  );
  expect(result.conflicts).toEqual([]);
});

test("preserves unsupported shell commands and blocks ambiguous or interpolated operands", () => {
  for (const before of ["custom-run src/orders/seed.ts", "bun src/orders/${stage}.ts"]) {
    const result = rewriteLayoutTooling("scripts/seed.sh", before, moves);
    expect(result.text).toBe(before);
    expect(result.conflicts).toHaveLength(1);
  }
});

test("rewrites package scripts by command syntax while preserving unrelated shell payloads", () => {
  const before = JSON.stringify({
    scripts: { seed: 'bun src/orders/seed.ts && echo "src/orders/payload"' },
  });
  const result = rewriteLayoutTooling("package.json", before, moves);
  expect(JSON.parse(result.text).scripts.seed).toBe(
    'bun src/services/orders/seed.ts && echo "src/orders/payload"',
  );
  expect(result.conflicts).toEqual([]);
});

test("keeps prose ambiguous but supports explicit Markdown paths and JSON config positions", () => {
  expect(
    rewriteLayoutTooling("README.md", "Read src/orders/seed.ts", moves).conflicts,
  ).toHaveLength(1);
  expect(rewriteLayoutTooling("README.md", "Read `src/orders/seed.ts`", moves).text).toBe(
    "Read `src/services/orders/seed.ts`",
  );
  expect(
    JSON.parse(
      rewriteLayoutTooling("codegen.json", '{"schema":"src/orders/schema/index.ts"}', moves).text,
    ),
  ).toEqual({ schema: "src/services/orders/schema/index.ts" });
});

test("rewrites complete root literals without matching similarly named unrelated directories", () => {
  expect(
    JSON.parse(rewriteLayoutTooling("codegen.json", '{"schema":"src/orders"}', moves).text),
  ).toEqual({ schema: "src/services/orders" });
  const unrelated = rewriteLayoutTooling("README.md", "`src/orders-backup/file.ts`", moves);
  expect(unrelated).toEqual({ text: "`src/orders-backup/file.ts`", conflicts: [] });
});
