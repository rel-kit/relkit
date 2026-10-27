---
"@relkit/cli": patch
"create-relkit": patch
---

Add `relkit add inspector`, which enables `inspector.enabled`, installs `@relkit/inspector` as a project devDependency and adds an `inspector` script, and `relkit inspector [--port] [--hostname]`, which runs that project-local UI, so inspection no longer needs a global install. New applications select the Scalar API reference (`server.apiDocs.ui: "scalar"`), so `relkit dev` advertises it, and the create summary's backend link now points at a served endpoint instead of the unrouted root.
