/** Preserves selected native SDK identity after its owner moves SDK declarations to peers. */
import { expect, it } from "@effect/vitest";
import { Effect, Logger } from "effect";
import { ContributorWorkspace } from "../../src/contributor-workspace.service.js";
import { workspaceFixture } from "./workspace.fixture.js";

it.effect("shares only explicitly selected external peers without selecting optional domains", () =>
  Effect.gen(function* () {
    const fixture = workspaceFixture();
    fixture.manifests.set("/repo/packages/a/package.json", {
      name: "@relkit/a",
      dependencies: { "@relkit/b": "workspace:*" },
      peerDependencies: { effect: "4.0.1", "unused-sdk": "1.0.0", "@relkit/unselected": "*" },
      peerDependenciesMeta: { effect: { optional: true } },
    });
    yield* Effect.gen(function* () {
      const service = yield* ContributorWorkspace;
      const selected = yield* service.links("/repo", { "@relkit/a": "*" }, { effect: "catalog:" });
      expect([...selected.keys()].sort()).toEqual(["@relkit/a", "@relkit/b", "effect"]);
      expect(selected.get("effect")).toBe("/shared/effect");
      const unselected = yield* service.links("/repo", { "@relkit/a": "*" }, {});
      expect([...unselected.keys()].sort()).toEqual(["@relkit/a", "@relkit/b"]);
    }).pipe(Effect.provide(fixture.layer));
  }).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("keeps project frontend peers local while sharing selected native peers", () =>
  Effect.gen(function* () {
    const fixture = workspaceFixture();
    fixture.manifests.set("/repo/packages/a/package.json", {
      name: "@relkit/a",
      peerDependencies: { effect: "4.0.1", next: "4.0.1", react: "4.0.1", "react-dom": "4.0.1" },
    });
    yield* Effect.gen(function* () {
      const service = yield* ContributorWorkspace;
      const selected = yield* service.links(
        "/repo",
        { "@relkit/a": "*" },
        { effect: "4.0.1", next: "4.0.1", react: "4.0.1", "react-dom": "4.0.1" },
      );
      expect([...selected.keys()].sort()).toEqual(["@relkit/a", "effect"]);
    }).pipe(Effect.provide(fixture.layer));
  }).pipe(Effect.provide(Logger.layer([]))),
);
