/**
 * Checks finite post-install preparation is printed before the first dev launch.
 * These pure presentation tests acquire no filesystem or process; installation
 * state controls the displayed commands without changing later manual checks.
 */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createGenerateNextSteps, formatGenerateResult } from "../src/generate-output.js";

it.effect("prints install and finite preparation before dev when installation was skipped", () =>
  Effect.sync(() => {
    const nextSteps = createGenerateNextSteps({ examples: true, install: false }, "/project", "/");
    expect(nextSteps.commands.prepare).toBe("bunx --no-install relkit dev --prepare");
    const output = formatGenerateResult({ nextSteps });
    expect(output.indexOf("bun install")).toBeLessThan(output.indexOf("relkit dev --prepare"));
    expect(output.indexOf("relkit dev --prepare")).toBeLessThan(output.indexOf("bun run dev"));
    expect(output).toContain("bun run check");
  }),
);

it.effect("does not repeat preparation in an installed project's onboarding", () =>
  Effect.sync(() => {
    const nextSteps = createGenerateNextSteps({ examples: false, install: true }, "/project", "/");
    expect(nextSteps.commands.install).toBeUndefined();
    expect(nextSteps.commands.prepare).toBeUndefined();
    expect(formatGenerateResult({ nextSteps })).not.toContain("relkit dev --prepare");
    expect(formatGenerateResult({ unexpected: "result" })).toBe('{"unexpected":"result"}');
  }),
);
