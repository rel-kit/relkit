---
"create-relkit": patch
---

Generate a native Bun SQLite migration runner so database and auth apps can apply
Drizzle migrations without selecting a Node-only driver. Include generated context
declarations in every starter's TypeScript program so database and auth context
types are available to application functions.
