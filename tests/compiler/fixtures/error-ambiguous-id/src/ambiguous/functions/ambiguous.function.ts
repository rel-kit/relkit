import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

const build = () =>
  defineFunction({
    input: z.object({ value: z.string() }),
    output: z.object({ value: z.string() }),
    handler: async (input) => input,
  });

export default build();
