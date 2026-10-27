/**
 * Checks finite preparation precedes dev and onboarding advertises only served endpoints.
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

it.effect("advertises served backend and default Scalar reference endpoints", () =>
  Effect.sync(() => {
    const nextSteps = createGenerateNextSteps({ examples: true, install: true }, "/project", "/");
    expect(nextSteps.endpoints.backend).toBe("http://localhost:3000/hello?name=RelKit");
    expect(nextSteps.endpoints.apiReference).toBe("http://localhost:3000/_relkit/v1/api-reference");
    const output = formatGenerateResult({ nextSteps });
    expect(output).toContain("backend:   http://localhost:3000/hello?name=RelKit");
    expect(output).toContain("openapi:   http://localhost:3000/_relkit/v1/openapi.json");
    expect(output).toContain("api docs:  http://localhost:3000/_relkit/v1/api-reference");
    expect(output).toContain("bunx relkit add inspector");
  }),
);

it.effect("falls back to the reference UI when examples, and their routes, are omitted", () =>
  Effect.sync(() => {
    const nextSteps = createGenerateNextSteps({ examples: false, install: true }, "/project", "/");
    expect(nextSteps.endpoints.backend).toBe("http://localhost:3000/_relkit/v1/api-reference");
    expect(nextSteps.endpoints).not.toHaveProperty("route");
    const output = formatGenerateResult({ nextSteps });
    expect(output).toContain("backend:   http://localhost:3000/_relkit/v1/api-reference");
    expect(output).not.toContain("api docs:");
  }),
);

it.effect("preserves an explicitly supplied reference endpoint in presentation metadata", () =>
  Effect.sync(() => {
    const core = createGenerateNextSteps({ examples: true, install: true }, "/project", "/");
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
