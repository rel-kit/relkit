/** The options form of `defineBetterAuthService` still works and warns once, naming the replacement. */
import { afterEach, expect, spyOn, test } from "bun:test";
import { betterAuth } from "better-auth";
import { resetDeprecationWarnings } from "relkit/diagnostics";
import { defineBetterAuthService } from "../src/index.ts";

const settings = {
  secret: "deprecated-test-secret-deprecated-test-secret",
  baseURL: "http://localhost",
  emailAndPassword: { enabled: true },
} as const;

/** Runs `run` and returns every line it wrote to the console. */
function consoleLines(run: () => void): string[] {
  const lines: string[] = [];
  const spies = (["log", "warn", "error", "info"] as const).map((method) =>
    spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    }),
  );
  try {
    run();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  return lines.filter((line) => line.includes("RELKIT_DEPRECATED_"));
}

afterEach(resetDeprecationWarnings);

test("the options form warns once with the replacement and a docs link", () => {
  const lines = consoleLines(() => {
    const first = defineBetterAuthService(settings);
    const second = defineBetterAuthService(settings);
    expect(typeof first.handler).toBe("function");
    expect(typeof second.handler).toBe("function");
  });
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("RELKIT_DEPRECATED_BETTER_AUTH_OPTIONS");
  expect(lines[0]).toContain("defineBetterAuthService({ auth })");
  expect(lines[0]).toContain(
    "https://relkit.dev/docs/errors/relkit-deprecated-better-auth-options",
  );
});

test("the instance form does not warn", () => {
  const auth = betterAuth(settings);
  expect(consoleLines(() => void defineBetterAuthService({ auth }))).toEqual([]);
});
