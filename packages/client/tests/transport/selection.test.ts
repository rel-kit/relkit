import { expect, it } from "@effect/vitest";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { runExecutionPromise } from "@relkit/contracts/operation";
import {
  ClientTransport,
  clientTransportLayer,
  selectAutoTransport,
} from "../../src/transport.service.js";
import type { TransportLink } from "../../src/transport.types.js";
import { TestSocket } from "./socket-fixture.js";

class SelectedLink extends Context.Service<SelectedLink, TransportLink>()("TestSelectedLink") {}

it.effect("auto owner closure interrupts pending actual socket callback acquisition", () =>
  Effect.promise(async () => {
    TestSocket.autoOpen = false;
    TestSocket.instances = [];
    TestSocket.created = Promise.withResolvers<TestSocket>();
    const owner = ManagedRuntime.make(
      clientTransportLayer(
        selectAutoTransport({
          baseUrl: "http://localhost",
          websocket: TestSocket,
          establishmentTimeoutMs: 60_000,
        }),
      ),
    );
    const pending = runExecutionPromise(
      owner,
      Effect.flatMap(ClientTransport, (service) => service.invoke([], undefined, { context: {} })),
    ).catch((error) => error);
    try {
      const socket = await TestSocket.created.promise;
      await owner.dispose();
      await pending;
      expect(socket.closes).toBe(1);
    } finally {
      await owner.dispose();
      TestSocket.autoOpen = true;
    }
  }),
);

it.effect("selected sockets remain Layer-owned until their native SDK handoff", () =>
  Effect.promise(async () => {
    TestSocket.instances = [];
    const make = () =>
      ManagedRuntime.make(
        Layer.effect(
          SelectedLink,
          selectAutoTransport({
            baseUrl: "http://localhost",
            websocket: TestSocket,
          }),
        ),
      );
    const unused = make();
    try {
      await runExecutionPromise(unused, SelectedLink);
      await unused.dispose();
      expect(TestSocket.instances[0]?.closes).toBe(1);
    } finally {
      await unused.dispose();
    }
    const transferred = make();
    const caller = new AbortController();
    try {
      const link = await runExecutionPromise(transferred, SelectedLink);
      const socket = TestSocket.instances[1]!;
      const pending = link
        .call([], undefined, { context: {}, signal: caller.signal })
        .catch((error) => error);
      await socket.sent.promise;
      caller.abort();
      await pending;
      await transferred.dispose();
      expect(socket.closes).toBe(0);
    } finally {
      caller.abort();
      await transferred.dispose();
      TestSocket.instances[1]?.close();
    }
  }),
);
