---
"@relkit/client": minor
"@relkit/cli": minor
---

Breaking: Route hooks (`useRoute`, `useSuspenseRoute`, `useRouteMutation`, `useInfiniteRoute`, `useRouteUtils` and `useStream`) take a property of the generated `api` object, such as `useRoute(api.orders.searchOrders, …)`, instead of a `"METHOD /path"` or route ID string, and a route's error type is a union you narrow on `code`. `useRouteMutation` no longer starts jobs; use `useJobTrigger`. `relkit migrate` rewrites string keys from the backend's client contract. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#client-hooks).
