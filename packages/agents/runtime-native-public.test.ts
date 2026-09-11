import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import { nativePublicEvent } from "./src/runtime-native-public.ts";

test("native public state omits undefined selected values", async () => {
  const event = await nativePublicEvent(
    {
      method: "values",
      seq: 1,
      params: {
        namespace: [],
        timestamp: new Date(0).toISOString(),
        data: { todos: undefined },
      },
    } as never,
    new Map([["todos", z.array(z.string())]]),
  );

  expect(event).not.toHaveProperty("value");
});

test("native public state validates selected values", async () => {
  await expect(
    nativePublicEvent(
      {
        method: "values",
        seq: 1,
        params: {
          namespace: [],
          timestamp: new Date(0).toISOString(),
          data: { todos: [42] },
        },
      } as never,
      new Map([["todos", z.array(z.string())]]),
    ),
  ).rejects.toMatchObject({ code: "RELKIT_AGENT_OUTPUT_VALIDATION" });
});
