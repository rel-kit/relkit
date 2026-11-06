import { defineTransform } from "relkit";
import { z } from "relkit/schema";

export default defineTransform({ schema: z.string() });
