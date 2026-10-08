import { Context, Effect, Layer, Ref, Stream } from "effect";
import { cliAdapterError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { HttpCapabilities } from "./http.types.js";
import { CliCleanup, cleanupEffect, cleanupLayer } from "./cleanup.service.js";

/** Bounded HTTP requests and response streams; authentication policy belongs to domain services. */
export class CliHttp extends Context.Service<CliHttp, HttpCapabilities>()("relkit/cli/Http") {}

/**
 * Reads bounded bytes with body cleanup even for a rejected declared content length.
 * @param response - Response body owned by this read.
 * @param maximumBytes - Raw byte bound.
 * @returns UTF-8 text or a typed limit/read failure, preserving fiber interruption.
 */
const readText = Effect.fn("CliHttp.readText")(function* (
  response: Response,
  maximumBytes: number,
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const body = yield* Effect.acquireRelease(
        Effect.sync(() => response.body),
        (body) =>
          body === null
            ? Effect.void
            : cleanupEffect(
                "http.body.release",
                cliPromise("http.cancel", () => body.cancel()),
              ),
      );
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maximumBytes)
        return yield* Effect.fail(
          cliAdapterError("http.limit", new Error("HTTP response exceeded its byte limit.")),
        );
      if (body === null) return "";
      const bytes = yield* Ref.make(0);
      return yield* Stream.fromReadableStream({
        evaluate: () => body,
        releaseLockOnEnd: true,
        onError: (cause) => cliAdapterError("http.read", cause),
      }).pipe(
        Stream.mapEffect((chunk) =>
          Ref.updateAndGet(bytes, (size) => size + chunk.byteLength).pipe(
            Effect.flatMap((size) =>
              size > maximumBytes
                ? Effect.fail(
                    cliAdapterError(
                      "http.limit",
                      new Error("HTTP response exceeded its byte limit."),
                    ),
                  )
                : Effect.succeed(chunk),
            ),
          ),
        ),
        Stream.decodeText(),
        Stream.mkString,
      );
    }),
  );
});

/**
 * Supplies native fetch while leaving retries, tokens, and protocol validation to domains.
 * @returns A substitutable live HTTP Layer with no session or cross-request cache.
 */
export const httpLayer = Layer.effect(
  CliHttp,
  Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    return CliHttp.of({
      request: Effect.fn("CliHttp.request")(
        (url: string | URL, options?: Omit<RequestInit, "signal">) =>
          observeCli(
            "http.request",
            Effect.acquireRelease(
              cliPromise("http.request", (signal) => fetch(url, { ...options, signal })),
              (response) =>
                response.body === null || response.body.locked
                  ? Effect.void
                  : cleanupEffect(
                      "http.response.release",
                      cliPromise("http.cancel", () => response.body!.cancel()),
                    ).pipe(Effect.provideService(CliCleanup, cleanup)),
              { interruptible: true },
            ),
          ),
      ),
      text: Effect.fn("CliHttp.text")((response: Response, maximumBytes: number) =>
        observeCli(
          "http.text",
          readText(response, maximumBytes).pipe(Effect.provideService(CliCleanup, cleanup)),
        ),
      ),
      json: Effect.fn("CliHttp.json")(
        function* (response: Response, maximumBytes: number) {
          const text = yield* readText(response, maximumBytes).pipe(
            Effect.provideService(CliCleanup, cleanup),
          );
          const value: unknown = yield* cliTry("http.json", () => JSON.parse(text));
          return value;
        },
        (effect, _response: Response, _maximumBytes: number) => observeCli("http.json", effect),
      ),
    });
  }),
).pipe(Layer.provideMerge(cleanupLayer));
