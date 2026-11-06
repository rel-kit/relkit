---
"@relkit/testing": minor
"@relkit/cli": minor
---

Adapter conformance suites. `@relkit/testing/runtime-conformance` checks a runtime adapter from inside its runtime, and `@relkit/testing/deploy-target-conformance` checks a `relkit deploy init` target. Deploy targets are now a public interface: `DeployTarget` and the Railway, Vercel and Cloudflare targets are exported from `@relkit/cli/deploy-targets`, and `relkit deploy init` dispatches through them with unchanged output. The agent adapter harness reports through `runConformance` like the other suites.
