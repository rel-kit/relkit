/** Runs maintained commerce acceptance against actual grouped and flat modules with one scoped owner per layout. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { PairedCommerce, pairedCommerceLayer } from "./fixtures/paired-commerce.service.js";
import type { commerceGraphContract } from "./fixtures/paired-commerce-graph.js";

let flatContract: ReturnType<typeof commerceGraphContract> | undefined;

for (const grouped of [false, true]) {
  test(
    `native commerce contracts retain ${grouped ? "grouped" : "flat"} source compatibility`,
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const owner = yield* PairedCommerce;
          const result = yield* owner.run(grouped).pipe(Effect.timeout("90 seconds"));
          expect(result.output).toContain("0 fail");
          expect(result.output).toContain("support agent");
          expect(result.output).toContain("cached-price tutorial");
          if (!grouped) flatContract = result;
          else {
            if (!flatContract) throw new Error("The native flat comparison did not succeed");
            expect(result.logical).toEqual(flatContract.logical);
            expect(result.graphHash).not.toBe(flatContract.graphHash);
          }
          console.log(`${result.layout} native commerce acceptance:\n${result.output}`);
        }).pipe(Effect.provide(pairedCommerceLayer)),
      ),
    120_000,
  );
}
