/**
 * Runs one finite cold/warm installation through captured native command
 * authority and measures its actual closure after success. Failed attempts keep
 * their original command diagnostics and never become empty passing samples.
 */
import { Clock, Effect, Exit, Cause } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { consumerInstallCommand } from "./consumer-install-command.js";
import { inspectInstallation } from "./consumer-installation.js";
import { accountDependencies } from "./consumer-dependency-policy.js";
import type {
  ConsumerFixture,
  ConsumerInstallSample,
  ConsumerManager,
} from "./consumer-benchmark.types.js";
import type { ConsumerRegistry } from "./consumer-registry.types.js";
import type { ScaffoldProcess } from "./scaffold-process.js";

/**
 * Preserves native command failure and installed-byte evidence for one attempt.
 * @param run - Captured finite process authority.
 * @param fixture - Exact dependency selection.
 * @param manager - Explicit installed manager/layout.
 * @param root - External fixture directory.
 * @param cache - Fixture-owned cache directory.
 * @param registry - Scope-owned measuring registry.
 * @param condition - Cold or warm cache classification.
 * @returns Lazy retained sample; interruption and defects propagate unchanged.
 */
export const measureConsumerInstall = Effect.fn("ConsumerInstall.measure")(
  function* (
    run: Effect.Success<typeof ScaffoldProcess.make>["run"],
    fixture: ConsumerFixture,
    manager: ConsumerManager,
    root: string,
    cache: string,
    registry: ConsumerRegistry,
    condition: ConsumerInstallSample["condition"],
  ) {
    const command = yield* consumerInstallCommand(manager, fixture, root, registry.url, cache);
    const transferred = registry.transferredBytes(),
      start = yield* Clock.monotonicTimeNanos;
    const exit = yield* Effect.exit(run(command));
    const durationMs = Number((yield* Clock.monotonicTimeNanos) - start) / 1_000_000;
    let failure: string | null = null;
    if (Exit.isFailure(exit)) {
      if (Cause.hasDies(exit.cause) || Cause.hasInterrupts(exit.cause))
        return yield* Effect.failCause(exit.cause);
      failure = Cause.pretty(exit.cause);
    }
    const installation = Exit.isSuccess(exit)
      ? yield* inspectInstallation(root, { development: !fixture.production })
      : null;
    const instances = (installation?.instances ?? []).map((item) => {
      const archive = registry.archives.get(`${item.name}@${item.version}`);
      return {
        ...item,
        archive:
          archive === undefined
            ? null
            : { identity: `${archive.name}@${archive.version}`, bytes: archive.bytes },
      };
    });
    return {
      fixture: fixture.name,
      manager,
      condition,
      root,
      durationMs,
      transferredBytes: registry.transferredBytes() - transferred,
      command: [command.executable ?? "bun", ...command.args],
      stdout: Exit.isSuccess(exit) ? exit.value : "",
      failure,
      installation,
      instances,
      accounting: installation === null ? null : accountDependencies(instances),
    } satisfies ConsumerInstallSample;
  },
  (effect) => observeExecution("testing", "consumer.install.sample", effect),
);
