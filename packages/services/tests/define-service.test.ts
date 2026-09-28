import { describe, expect, test } from "vitest";
import { Cause, Effect, Exit, Layer, Tracer } from "effect";
import { defineEvent } from "@relkit/events";
import { defineFunction } from "@relkit/functions";
import { defineJob, defineTask } from "@relkit/jobs";
import { z } from "@relkit/schema";
import {
  DescriptorIdentityError,
  getDescriptorServiceIdentity,
  IdentityStore,
} from "@relkit/invocation";
import {
  defineService,
  defineServiceEffect,
  isServiceDescriptor,
  ServiceValidationError,
} from "../src/index.js";

const lookup = defineFunction({
  id: "orders.lookup",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: async (input) => input,
});
const created = defineEvent({
  id: "orders.created",
  version: 1,
  input: z.object({ id: z.string() }),
});

describe("service authoring", () => {
  test("preserves public member identity and binds ownership", () => {
    const orders = defineService({ id: "orders", functions: { lookup }, events: { created } });
    expect(orders.lookup).toBe(lookup);
    expect(orders.created).toBe(created);
    expect("functions" in orders).toBe(false);
    expect("events" in orders).toBe(false);
    expect(getDescriptorServiceIdentity(lookup)).toBe("orders");
    expect(isServiceDescriptor(orders)).toBe(true);
    expect(Object.isFrozen(orders)).toBe(true);
  });

  test("supports empty, inferred, and event-only services", () => {
    const eventOnly = defineEvent({ id: "events.created", input: z.object({ id: z.string() }) });
    expect(isServiceDescriptor(defineService({ id: "empty" }))).toBe(true);
    expect(defineService({ id: "events", events: { created: eventOnly } }).created).toBe(eventOnly);
    expect(defineService({}).id).toMatch(/^unbound\./);
  });

  test("accepts task and job members without replacing their descriptors", () => {
    const task = defineTask({
      id: "services.task",
      version: "1",
      input: z.string(),
      output: z.string(),
      handler: async (input) => input,
    });
    const job = defineJob({ name: "serviceJob", task });
    const service = defineService({ id: "service-task-job", tasks: { task }, jobs: { job } });
    expect(service.task).toBe(task);
    expect(service.job).toBe(job);
    expect(isServiceDescriptor(service)).toBe(true);
  });

  test("reports expected input failures in the Effect error channel", () => {
    const nullMessage = Effect.runSync(
      Effect.catchTag(defineServiceEffect(null as never), "ServiceValidationError", (error) =>
        Effect.succeed(error.message),
      ),
    );
    expect(nullMessage).toBe("Service options must be an object");
    const reserved = Effect.runSync(
      Effect.flip(
        defineServiceEffect({
          id: "bad",
          functions: { functions: lookup },
        }),
      ),
    );
    expect(reserved._tag).toBe("ServiceValidationError");
    expect(() => defineService({ id: "bad", functions: { functions: lookup } })).toThrow(
      "reserved",
    );
    expect(() => defineService({ id: "bad", functions: { lookup: {} as typeof lookup } })).toThrow(
      "Invalid service function",
    );
    expect(() => defineService({ id: "bad", events: { created: {} as typeof created } })).toThrow(
      "Invalid service event",
    );
    expect(Effect.runSync(Effect.flip(defineServiceEffect({ id: "bad/id" })))._tag).toBe(
      "ServiceValidationError",
    );
  });

  test("runs event validation in the caller trace", () => {
    const event = defineEvent({ id: "traced.created", input: z.string() });
    const spans: string[] = [];
    const tracer = Tracer.make({
      span(options) {
        spans.push(options.name);
        return Tracer.nativeTracer.span(options);
      },
    });
    Effect.runSync(
      Effect.withTracer(defineServiceEffect({ id: "traced", events: { event } }), tracer),
    );
    expect(spans).toContain("services.define");
    expect(spans).toContain("events.event.assertDescriptor");
  });

  test("preserves an unexpected event getter defect through both APIs", () => {
    const event = defineEvent({ id: "getter.created", input: z.string() });
    const defect = new Error("event input getter failed");
    const broken = new Proxy(event, {
      get(target, property, receiver) {
        if (property === "input") throw defect;
        return Reflect.get(target, property, receiver);
      },
    });
    const options = { id: "getter", events: { event: broken } };
    const exit = Effect.runSyncExit(defineServiceEffect(options));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(defect);
    expect(() => defineService(options)).toThrow(defect);
  });

  test("rejects member ownership conflicts through both APIs", () => {
    const member = defineFunction({
      id: "shared.member",
      input: z.object({}),
      output: z.object({}),
      handler: () => ({}),
    });
    defineService({ id: "first", functions: { member } });
    expect(() => defineService({ id: "second", functions: { member } })).toThrow(
      DescriptorIdentityError,
    );
    expect(() => defineService({ id: "second", functions: { member } })).toThrow(
      "already belongs to another service",
    );
    const error = Effect.runSync(
      Effect.flip(
        defineServiceEffect({
          id: "third",
          functions: { member },
        }),
      ),
    );
    expect(error).toBeInstanceOf(ServiceValidationError);
    expect(error.message).toContain("already belongs");
  });

  test("turns a substituted identity generator failure into a tagged error", () => {
    const layer = Layer.succeed(
      IdentityStore,
      IdentityStore.of({
        canonical: new WeakMap(),
        unbound: new WeakMap(),
        services: new WeakMap(),
        nextUnboundId: () => {
          throw new TypeError("identity generator failed");
        },
      }),
    );
    const error = Effect.runSync(Effect.provide(Effect.flip(defineServiceEffect({})), layer));
    expect(error).toBeInstanceOf(ServiceValidationError);
    expect(error.message).toBe("identity generator failed");
  });

  test("rejects malformed category maps and duplicate names in order", () => {
    expect(() => defineService({ id: "bad", events: [] as never })).toThrow(
      "events must be an object",
    );
    expect(() => defineService({ id: "bad", tasks: { run: {} as never } })).toThrow(
      "Invalid service task",
    );
    expect(() => defineService({ id: "bad", jobs: { run: {} as never } })).toThrow(
      "Invalid service job",
    );
    expect(() =>
      defineService({ id: "bad", functions: { lookup }, events: { lookup: created } }),
    ).toThrow('Duplicate service member "lookup"');
  });
});
