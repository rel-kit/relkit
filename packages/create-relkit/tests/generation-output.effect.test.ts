/**
 * Checks finite preparation precedes dev and onboarding advertises only available API endpoints.
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

it.effect("advertises OpenAPI without an unselected reference UI", () =>
  Effect.sync(() => {
    const nextSteps = createGenerateNextSteps({ examples: true, install: true }, "/project", "/");
    expect(nextSteps.endpoints).not.toHaveProperty("apiReference");
    const output = formatGenerateResult({ nextSteps });
    expect(output).toContain("openapi:   http://localhost:3000/_relkit/v1/openapi.json");
    expect(output).not.toContain("api docs:");
    expect(output).not.toContain("/_relkit/v1/api-reference");
  }),
);

it.effect("preserves an explicitly supplied reference endpoint in presentation metadata", () =>
  Effect.sync(() => {
    const core = createGenerateNextSteps({ examples: false, install: true }, "/project", "/");
    const nextSteps = {
      ...core,
      endpoints: {
        ...core.endpoints,
        apiReference: "http://localhost:3000/_relkit/v1/api-reference" as const,
      },
    };
    expect(formatGenerateResult({ nextSteps })).toContain(
      "api docs:  http://localhost:3000/_relkit/v1/api-reference",
    );
  }),
);
