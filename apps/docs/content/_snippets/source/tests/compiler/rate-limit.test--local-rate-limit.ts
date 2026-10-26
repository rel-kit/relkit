const route = defineRoute({
  id: "orders.local-rate-limit",
  target,
  rateLimit: { limit: 2, windowMs: 1_000, key: http.constant("global") },
});
