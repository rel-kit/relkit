import type { JobsAdapterRuntime } from "@relkit/jobs/adapter";
import { Stream } from "effect";
import { runLocal, runLocalSync } from "../local-effect.js";
import { makeNativeJobService } from "./native.service.js";

/**
 * Creates the Promise/AsyncIterable adapter over one native jobs service.
 * @param root - Owned local state directory.
 * @param profile - Local jobs namespace.
 * @returns The stable jobs adapter protocol with lazy durable recovery.
 */
export function createLocalNativeJobProvider(root: string, profile: string): JobsAdapterRuntime {
  const service = runLocalSync(makeNativeJobService(root, profile));
  return Object.freeze<JobsAdapterRuntime>({
    ...service.metadata,
    submit: (request, context) => runLocal(service.submit(request, context), context.signal),
    get: (request, context) => runLocal(service.get(request, context), context.signal),
    list: (request, context) => runLocal(service.list(request, context), context.signal),
    cancel: (request, context) => runLocal(service.cancel(request, context), context.signal),
    retry: (request, context) => runLocal(service.retry(request, context), context.signal),
    observe: (request, context) =>
      runLocalSync(
        Stream.toAsyncIterableEffect(
          service.observe(request, context).pipe(Stream.mapError((error) => error.cause)),
        ),
      ),
    close: () => runLocal(service.close()),
    worker: {
      next: (context) => runLocal(service.worker.next(context), context.signal),
      complete: (id, output, context) =>
        runLocal(service.worker.complete(id, output, context), context.signal),
      fail: (id, error, context) =>
        runLocal(service.worker.fail(id, error, context), context.signal),
      suspend: (id, value, context) =>
        runLocal(service.worker.suspend(id, value, context), context.signal),
    },
  });
}
