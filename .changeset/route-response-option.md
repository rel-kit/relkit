---
"relkit": minor
"@relkit/testing": minor
---

New: A function route's `response` option sets the success status, headers and cookies from the function's output, for example `response: (order) => ({ status: 201, headers: { location: \`/orders/${order.orderId}\` } })`. The function is unchanged, so jobs and tools that call it are unaffected.
