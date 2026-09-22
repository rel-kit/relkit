---
name: relkit-deploy
description: Prepare, preview, and deploy a RELKIT application to AWS with Pulumi. Use for RELKIT cloud stack operations; not for local development or the docs site's Railway deployment.
---

# Deploy a RELKIT application

RELKIT's supported application deployment path uses AWS hosting with Pulumi. Work from the
generated application's root. Check `relkit.config.ts` and the installed CLI help before
assuming an existing app has AWS and Pulumi integrations; a new app can opt in with
`bunx create-relkit@latest <name> --cloud aws --deploy pulumi`.

## Prepare a reviewable plan

1. Identify the AWS account, region, Pulumi backend, and stack. Use an isolated stack for a
   new environment. Confirm the application owns each resource it intends to provision;
   connected adapters and local Docker profiles do not become cloud infrastructure.
2. Run `bun run check`, `bun run typecheck`, `bun run test`, `bun run build`, and
   `bun run relkit doctor --pulumi`. Resolve failures in source or configuration, not in the
   generated Pulumi program under `.relkit/generated/pulumi`.
3. Run `bun run relkit deploy init --stack <stack>` and
   `bun run relkit deploy preview --stack <stack>` with the selected backend and credentials.
   Review creates, updates, replacements, deletions, access changes, and expected cost.

Cloud operations can create billable resources. Apply only when the user's authorization
covers the target and cost. If it does not, present the concrete preview and ask before
`bun run relkit deploy up --stack <stack>`. Do not use `--non-interactive` or `--yes` to
bypass that review. Keep secrets out of logs and committed files; use supported secret
configuration for Pulumi values.

After an authorized apply, run `bun run relkit deploy outputs --stack <stack>` and verify
the deployed application with a relevant health check and request flow. Report the stack,
resource changes, endpoint, and any failed verification. `refresh` and `destroy` are
separate operations; do not run them merely to complete a deployment.

See the [deployment guide](https://relkit.up.railway.app/docs/operations/deployment) for
ownership and lifecycle details and the [CLI reference](https://relkit.up.railway.app/docs/operations/cli-reference)
for current flags. Match commands to the application's installed CLI version.
