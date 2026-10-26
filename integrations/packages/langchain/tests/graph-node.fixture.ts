/** Creates isolated native graph node fixtures; each caller owns the returned model, state and provider observations. */

import { z } from "@relkit/schema";

export const input = z.object({ summary: z.string() });

export const output = z.object({ approved: z.boolean() });
