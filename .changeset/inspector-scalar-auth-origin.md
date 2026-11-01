---
"@relkit/cli": patch
---

Requests sent from the Inspector's API reference now reach origin-checked endpoints such as Better Auth sign-in and sign-up. The Inspector UI strips the browser's `Origin` before forwarding, and Better Auth answered `403 MISSING_OR_NULL_ORIGIN` because Node's `fetch` adds `sec-fetch-mode`, which makes Better Auth require an origin. `relkit dev` now addresses every token-authenticated Inspector request to the application's public listener with a matching `Origin`, so it is handled like a call from the application's own page. When the app's `BETTER_AUTH_URL` is a loopback URL, its origin is sent instead, so it matches Better Auth's trusted origin: for example `http://localhost:3000` rather than `http://127.0.0.1:3000`, or a frontend served on another port. Cross-origin browser requests to the Inspector are still rejected, and the bridge still requires its session token.
