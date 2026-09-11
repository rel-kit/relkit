import { tool } from "langchain";
import { z } from "@relkit/app/schema";

export const orderStatus = tool(
  async ({ orderId }) => ({ orderId, status: "ready", source: "native-langchain-tool" }),
  {
    name: "order_status",
    description: "Return deterministic demo inventory status.",
    schema: z.object({ orderId: z.string() }),
  },
);
