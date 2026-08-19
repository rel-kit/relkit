# Deployment

ZSys deployment is generated from the checked application graph and runs
through the Pulumi Automation API. AWS is the first supported cloud target;
the application graph remains the input to the plan and no second deployment
engine is introduced.

## Prerequisites

Before a deployment:

1. Install Bun `1.3.10` and the project dependencies.
2. Run `bun run check` and `bun run build`.
3. Run `zsys doctor --pulumi` to check the project, ports, Pulumi, and visible
   AWS credential configuration.
4. Select a Pulumi backend and stack. Use a separate stack for each isolated
   environment.

The current release gate pins Pulumi CLI `3.258.0`. Do not put credential
values in source, graph files, generated manifests, plans, or logs.

## Lifecycle

Run these commands from the generated project:

```sh
zsys deploy init --stack development
zsys deploy preview --stack development
zsys deploy up --stack development
zsys deploy refresh --stack development
zsys deploy outputs --stack development
zsys deploy destroy --stack development
```

`init` creates or selects the stack. `preview` computes the plan without
cloud mutation. `up` applies the plan, `refresh` reconciles state, and
`outputs` prints the resulting non-secret outputs. `destroy` removes the
stack's managed resources and requires confirmation unless the command is
non-interactive.

Use the same options for every lifecycle command when needed:

```sh
zsys deploy preview \
  --project-root . \
  --stack staging \
  --backend cloud \
  --config AWS_REGION=us-east-1 \
  --config-secret DATABASE_PASSWORD=provided-out-of-band \
  --non-interactive
```

Supported backends are `cloud`, `local`, `s3://...`, `azblob://...`, and
`gs://...`. `--config-secret name=value` marks a value secret and redacts it
from command errors. In automation, `--non-interactive` and `--yes` select the
non-interactive confirmation path; still review the preview artifact first.

## Generated plan and resource model

`zsys deploy preview` and `zsys deploy up` run `check` and `build` first, then
write the generated Pulumi program under:

```text
.zsys/generated/pulumi/Pulumi.yaml
.zsys/generated/pulumi/index.ts
.zsys/generated/pulumi/plan.json
```

The plan uses stable descriptor IDs for resource identity. Renaming or moving
the source file for an unchanged descriptor does not replace its cloud
resource. A second preview with no source or configuration change is a no-op.

The AWS plan maps the graph to the supported primitives:

| Graph capability      | AWS representation                      |
| --------------------- | --------------------------------------- |
| HTTP route and server | ECS/Fargate service behind an ALB       |
| Durable job           | SQS queue and dead-letter queue         |
| Scheduled trigger     | EventBridge Scheduler                   |
| Event trigger         | EventBridge bus and rules               |
| Object bucket         | S3 bucket                               |
| Cache                 | ElastiCache Valkey                      |
| Logs and traces       | CloudWatch and the configured OTLP sink |

Provider profiles are logical names in application source. Their concrete
AWS resources are selected by the deployment plan, while handlers still run
through the common ZSys function engine.

## Safety and cleanup

- Inspect `preview` before every `up` or destructive change.
- Use an isolated stack for tests and release evidence.
- Keep secrets in environment or secret configuration; never paste them into
  a graph, plan, generated Pulumi program, or issue.
- Verify outputs and application health after `up`.
- Run `refresh`, then `destroy` for temporary acceptance stacks.
- Independently verify that cleanup completed; a successful CLI exit alone is
  not cleanup evidence.

Production endpoints expose protected inspector APIs. Use the configured
authorization mechanism and do not publish an unprotected inspector endpoint.

## Deployment failures

Start with structured output and the diagnostic code:

```sh
zsys --json doctor --pulumi
zsys --json check
zsys --json deploy preview --stack development --non-interactive
```

Common codes are `ZSYS_DEPLOY_CHECK_FAILED`,
`ZSYS_DEPLOY_GRAPH_INVALID`, `ZSYS_DEPLOY_BUILD_FAILED`,
`ZSYS_DEPLOY_CONFIGURATION_MISSING`, `ZSYS_DEPLOY_AWS_CAPABILITY_UNSUPPORTED`,
`ZSYS_DEPLOY_AWS_PROFILE_UNSUPPORTED`, and `ZSYS_DEPLOY_SECRET_UNSUPPORTED`.
Fix the first check or plan error, rerun `check`, and preview again. Do not
edit the generated Pulumi program to bypass graph validation.
