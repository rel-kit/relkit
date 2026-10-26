import { expect, test } from "bun:test";
import { Effect } from "effect";
import { inspectorBrowserDriver } from "../../scripts/inspector-browser-driver";

test("browser clicks scroll their target before the unchanged physical click", async () => {
  const commands: string[][] = [];
  const driver = inspectorBrowserDriver(
    "http://127.0.0.1:3210",
    "driver-test",
    process.cwd(),
    new AbortController().signal,
    {
      run: ({ args }) =>
        Effect.sync(() => {
          commands.push([...args]);
          return "observed";
        }),
    },
  );
  expect(await driver.run("click", "@e1")).toBe("observed");
  await driver.run("fill", "@e2", "value");
  expect(commands).toEqual([
    ["--session", "driver-test", "scrollintoview", "@e1"],
    ["--session", "driver-test", "click", "@e1"],
    ["--session", "driver-test", "fill", "@e2", "value"],
  ]);
});

test("a failed scroll prevents the physical click", async () => {
  const commands: string[][] = [];
  const driver = inspectorBrowserDriver(
    "http://127.0.0.1:3210",
    "driver-test",
    process.cwd(),
    new AbortController().signal,
    {
      run: ({ args }) =>
        Effect.sync(() => {
          commands.push([...args]);
          throw new Error("Scroll failed");
        }),
    },
  );
  await expect(driver.run("click", "@e1")).rejects.toThrow("Scroll failed");
  expect(commands).toEqual([["--session", "driver-test", "scrollintoview", "@e1"]]);
});
