import { expect, it } from "@effect/vitest";
import { Effect, Fiber, Logger, Ref } from "effect";
import { ContributorWorkspace } from "../../src/contributor-workspace.service.js";
import { cliOriginalError } from "../../src/cli-errors.js";
import { contributorCallback } from "../../src/contributor-callback.js";
import { workspaceFixture } from "./workspace.fixture.js";

it.effect(
  "resolves cycles, catalog versions and shared runtime identity without CLI web links",
  () =>
    Effect.gen(function* () {
      const fixture = workspaceFixture();
      const links = yield* Effect.flatMap(ContributorWorkspace, (service) =>
        service.links(
          "/repo",
          { "@relkit/a": "*", "@relkit/cli": "*" },
          { effect: "catalog:", next: "16.3.6" },
        ),
      ).pipe(Effect.provide(fixture.layer));
      expect([...links.keys()].sort()).toEqual(["@relkit/a", "@relkit/b", "@relkit/cli", "effect"]);
      expect(links.get("effect")).toBe("/shared/effect");
    }).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("retains different external versions", () =>
  Effect.gen(function* () {
    const fixture = workspaceFixture();
    const links = yield* Effect.flatMap(ContributorWorkspace, (service) =>
      service.links("/repo", { "@relkit/a": "*" }, { effect: "3.0.0" }),
    ).pipe(Effect.provide(fixture.layer));
    expect(links.has("effect")).toBe(false);
  }).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("missing catalogs fail explicitly before project mutation", () =>
  Effect.gen(function* () {
    const fixture = workspaceFixture();
    fixture.manifests.set("/repo/package.json", {});
    const original = JSON.stringify(fixture.project());
    const result = yield* Effect.flatMap(ContributorWorkspace, (service) =>
      service.rewrite("/app"),
    ).pipe(Effect.result, Effect.provide(fixture.layer));
    expect(result._tag).toBe("Failure");
    expect(JSON.stringify(fixture.project())).toBe(original);
    expect(fixture.unlinked).toEqual([]);
  }).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("rejects malformed owned fields without manifest casts", () =>
  Effect.gen(function* () {
    const fixture = workspaceFixture();
    fixture.manifests.set("/app/package.json", { dependencies: { effect: 4 } });
    const result = yield* Effect.flatMap(ContributorWorkspace, (service) =>
      service.rewrite("/app"),
    ).pipe(Effect.result, Effect.provide(fixture.layer));
    expect(result._tag).toBe("Failure");
  }).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("preserves the missing workspace public Error diagnostic", () =>
  Effect.gen(function* () {
    const fixture = workspaceFixture();
    const result = yield* Effect.flatMap(ContributorWorkspace, (service) =>
      service.links("/repo", { "@relkit/missing": "*" }, {}),
    ).pipe(Effect.result, Effect.provide(fixture.layer));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure")
      expect(cliOriginalError(result.failure)).toMatchObject({
        message: "Workspace package not found: @relkit/missing",
      });
  }).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("materializes stale web fallbacks while preserving unrelated metadata", () =>
  Effect.gen(function* () {
    const fixture = workspaceFixture();
    fixture.manifests.set("/app/package.json", {
      ...fixture.project(),
      dependencies: { "@relkit/a": "*", next: "link:next" },
    });
    yield* Effect.flatMap(ContributorWorkspace, (service) => service.rewrite("/app")).pipe(
      Effect.provide(fixture.layer),
    );
    expect(fixture.project().dependencies?.next).toBe("16.3.6");
    expect(fixture.project().dependencies?.["@relkit/a"]).toBe("link:@relkit/a");
    expect(fixture.project().custom).toEqual({ keep: [1] });
    expect(fixture.unlinked).toEqual(["/app/node_modules/next"]);
  }).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("registers links in order and stops with the first failed native result", () =>
  Effect.gen(function* () {
    const fixture = workspaceFixture();
    fixture.fail("/repo/packages/b");
    const result = yield* Effect.flatMap(ContributorWorkspace, (service) =>
      service.prepare("/app"),
    ).pipe(Effect.provide(fixture.layer));
    expect(result).toEqual({ exitCode: 7, stdout: "out", stderr: "err" });
    expect(fixture.commands).toEqual(["/repo/packages/a", "/repo/packages/b"]);
  }).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("does not cache discovery or transient manifest failures", () =>
  Effect.gen(function* () {
    const fixture = workspaceFixture();
    yield* Effect.gen(function* () {
      const service = yield* ContributorWorkspace;
      fixture.manifests.set("/repo/packages/a/package.json", { name: "@relkit/old" });
      expect((yield* service.roots("/repo")).has("@relkit/old")).toBe(true);
      fixture.manifests.set("/repo/packages/a/package.json", { name: "@relkit/new" });
      expect((yield* service.roots("/repo")).has("@relkit/new")).toBe(true);
    }).pipe(Effect.provide(fixture.layer));
  }).pipe(Effect.provide(Logger.layer([]))),
);

it.live(
  "waits for callback physical settlement after cancellation before releasing its owner",
  () =>
    Effect.gen(function* () {
      const started = Promise.withResolvers<void>();
      const aborted = Promise.withResolvers<void>();
      const settle = Promise.withResolvers<number>();
      yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => settle.resolve(0)));
      const completed = yield* Ref.make(false);
      const fiber = yield* Effect.forkScoped(
        contributorCallback("contributor.test", async (signal) => {
          signal.addEventListener("abort", () => aborted.resolve(), { once: true });
          started.resolve();
          return settle.promise;
        }),
      );
      yield* Effect.promise(() => started.promise);
      const cancel = yield* Effect.forkScoped(
        Fiber.interrupt(fiber).pipe(Effect.tap(() => Ref.set(completed, true))),
      );
      yield* Effect.promise(() => aborted.promise);
      expect(yield* Ref.get(completed)).toBe(false);
      settle.resolve(0);
      yield* Fiber.join(cancel);
      expect(yield* Ref.get(completed)).toBe(true);
    }),
);
