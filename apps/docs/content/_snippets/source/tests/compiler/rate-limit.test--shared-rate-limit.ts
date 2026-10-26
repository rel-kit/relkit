const store = defineCache({
  id: "api-rate-limits",
  key: z.string(),
  value: z.number(),
});
const route = defineRoute({
  id: "orders.list.http",
  target,
  rateLimit: {
    limit: 100,
    windowMs: 60_000,
    key: http.header("x-api-key"),
    store,
  },
});
