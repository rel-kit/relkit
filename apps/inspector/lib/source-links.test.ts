import { expect, test } from "bun:test";
import { projectSource, sourceLabel, sourceLink, type SourceLinkConfig } from "./source-links";

const source = { file: "src/orders.ts", line: 4, column: 3 };

test("builds only configured local editor links from relative source metadata", () => {
  expect(sourceLink(source, { mode: "development", editor: "vscode" })).toBe(
    "vscode://file/src/orders.ts:4:3",
  );
  expect(sourceLink(source, { mode: "development", editor: "cursor" })).toBe(
    "cursor://file/src/orders.ts:4:3",
  );
  expect(sourceLink(source, { mode: "development", editor: "webstorm" })).toBe(
    "jetbrains://idea/navigate/reference?path=src%2Forders.ts&line=4&column=3",
  );
});

test("does not create executable links outside local development", () => {
  expect(sourceLink(source, { mode: "production", editor: "vscode" })).toBeUndefined();
  expect(sourceLink(source, { mode: "test", editor: "vscode" })).toBeUndefined();
  expect(
    sourceLink(source, {
      mode: "development",
      editor: "javascript:",
    } as unknown as SourceLinkConfig),
  ).toBeUndefined();
  expect(
    sourceLink(source, {
      mode: "development",
      editor: "vscode",
      backendUrl: "https://remote.example.test",
    }),
  ).toBeUndefined();
});

test("rejects absolute, escaping, and malformed source paths before rendering", () => {
  for (const value of [
    { file: "/srv/app/src/orders.ts", line: 4, column: 3 },
    { file: "C:\\srv\\app\\src\\orders.ts", line: 4, column: 3 },
    { file: "../secrets.txt", line: 4, column: 3 },
    { file: "vscode://file/src/orders.ts", line: 4, column: 3 },
  ]) {
    expect(projectSource(value)).toBeUndefined();
    expect(sourceLink(value, { mode: "development", editor: "vscode" })).toBeUndefined();
    expect(sourceLabel(value)).toBe("Source unavailable");
  }
});
