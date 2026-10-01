import { expect, test } from "bun:test";
import { isTypeScriptPluginSetting } from "./scope-typescript-settings.js";

test("the scope guard recognizes the TypeScript tooling key without exempting navigation values", () => {
  const text = '{"compilerOptions":{"plugins":[{"name":"@relkit/cli/editor"}]},"route":"/plugins"}';
  expect(
    isTypeScriptPluginSetting(
      "templates/default/v1/api/tsconfig.json",
      text,
      text.indexOf('"plugins"'),
    ),
  ).toBe(true);
  expect(
    isTypeScriptPluginSetting(
      "templates/default/v1/api/tsconfig.json",
      text,
      text.indexOf('"/plugins"'),
    ),
  ).toBe(false);
  expect(
    isTypeScriptPluginSetting(
      "templates/default/v1/api/navigation.json",
      text,
      text.indexOf('"plugins"'),
    ),
  ).toBe(false);
  expect(isTypeScriptPluginSetting("tsconfig.json", '{"plugins":[]}', 1)).toBe(false);
});
