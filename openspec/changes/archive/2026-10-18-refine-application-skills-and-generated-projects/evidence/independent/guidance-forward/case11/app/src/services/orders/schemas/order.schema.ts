import { z } from "@relkit/app/schema";
export const order = z.object({ id: z.string().min(1), userId: z.string().min(1), label: z.string().min(1) });
