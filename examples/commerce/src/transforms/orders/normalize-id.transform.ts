import { defineTransform } from "@relkit/app";
import { z } from "@relkit/schema";

export default defineTransform({ schema: z.string().min(1) });
