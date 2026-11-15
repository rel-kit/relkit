---
"relkit": patch
"@relkit/cli": patch
"@relkit/inspector": patch
---

The Inspector and `relkit mcp`'s `graph` tool read the whole application graph again. Since the
application-port graph probe was reduced to its activation witness, `GET /_relkit/v1/graph`
through the development bridge answered identity only, and every Inspector page failed with
"This page couldn't load". The generated development server now answers that probe with the
Inspector API's graph projection when the request carries the development inspection session
(which only the bridge adds); any other caller, including one with an application session or a
wrong session token, still gets identity only. The Inspector shows its not-available state when
an application answers without a graph instead of failing the whole page, and a provider's page
shows its failed state instead of loading forever.
