import { defineTransform } from "@relkit/app/routes";
import { z } from "@relkit/app/schema";

export default defineTransform({ schema: z.string().min(1) });
