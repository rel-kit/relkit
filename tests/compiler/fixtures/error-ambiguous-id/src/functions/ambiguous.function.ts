import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const build = () =>
  defineFunction({
    input: z.object({ value: z.string() }),
    output: z.object({ value: z.string() }),
    handler: async (input) => input,
  });

export default build();
