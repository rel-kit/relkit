---
"relkit": minor
"@relkit/cli": minor
---

A route module can export its `defineServiceRoutes` map directly with `export default defineServiceRoutes(service, { GET: "getOrder", POST: "createOrder" })`, and each method compiles to the same route as a `defineRoute` export. `relkit add route` writes this form. The editor plugin no longer offers the "Destructure the HTTP method" quick fix, and its route diagnostic now points to the default export. The destructured form still compiles.
