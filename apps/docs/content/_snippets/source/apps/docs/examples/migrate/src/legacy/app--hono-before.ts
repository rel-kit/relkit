import { Hono } from "hono";

const app = new Hono().basePath("/legacy");

app.get("/orders/:orderId", (c) => {
  const orderId = c.req.param("orderId");
  if (orderId === "missing") return c.json({ error: `Order ${orderId} was not found` }, 404);
  return c.json({ orderId, status: "confirmed", totalCents: 1_000 });
});

app.get("/health", (c) => c.text("ok"));
