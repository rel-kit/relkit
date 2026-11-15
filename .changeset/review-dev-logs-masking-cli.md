---
"@relkit/cli": patch
---

`relkit dev` prints an error logged for a request after that request completed; it was held and never shown. The Drizzle configuration error masks a connection password that contains `@` whole.
