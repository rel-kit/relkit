import { defineTransform } from "relkit/routes";
import { z } from "zod";

export default defineTransform({ schema: z.string().min(1) });
