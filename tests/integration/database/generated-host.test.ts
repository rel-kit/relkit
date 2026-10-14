/** Exercises every original native database/auth host contract in both grouped and flat source layouts with scoped ownership. */
import { test } from "bun:test";
import { Effect } from "effect";
import { generatedHostLayer } from "./generated-host.service.js";
import { verifyGeneratedHost } from "./generated-host-contracts.js";

for (const grouped of [true, false])
  test(
    `generated ${grouped ? "grouped" : "flat"} host preserves database/auth ownership, rollback, session admission and shutdown`,
    () => Effect.runPromise(verifyGeneratedHost(grouped).pipe(Effect.provide(generatedHostLayer))),
    90_000,
  );
