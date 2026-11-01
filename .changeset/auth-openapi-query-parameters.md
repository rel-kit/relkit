---
"@relkit/better-auth": patch
---

The API reference now documents every Better Auth query parameter. Better Auth's generator only reads a plain object query schema and never marks a field required, so endpoints such as `GET /account-info` (a union of `accountId` or `useAccountCookie`), `GET /get-session`, `POST /reset-password`, the OAuth callback and several organization, admin and magic-link endpoints showed no query fields, and Scalar sent requests that failed with `[query] Invalid input`. Query parameters are now derived from each endpoint's own schema, required fields are marked, and union endpoints describe their alternatives. Parameters an endpoint authors explicitly are kept.
