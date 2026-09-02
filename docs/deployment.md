# Deployment

RELKIT deployment is generated from the checked application graph. Pulumi is the
first deployment engine and AWS ECS is the first host, but engine, host,
application infrastructure, access, and runtime wiring are separate roles.

Cloud and deployment default to `none`. Generate an AWS/Pulumi project explicitly:

```sh
bunx create-relkit@latest my-app --cloud aws --deploy pulumi
```

For an existing project, install `@relkit/aws` and `@relkit/pulumi`, load them from
`relkit.config.ts`, and select `deployment: { engine: "pulumi", host: "aws" }` in
`defineApp`.

## Prerequisites

Before deployment:

1. Install Bun `1.3.10` and project dependencies.
2. Run `bun run check`, `bun run test`, and `bun run build`.
3. Run `relkit doctor --pulumi` to check Pulumi and visible AWS credentials.
4. Select a Pulumi backend and a separate stack for each isolated environment.

These commands can create billable resources. Continue only with authorization,
review every preview, and keep credentials out of source, graph, manifest, plan,
generated program, and logs.

## Lifecycle

Run from the generated project:

```sh
relkit deploy init --stack development
relkit deploy preview --stack development
relkit deploy up --stack development
relkit deploy refresh --stack development
relkit deploy outputs --stack development
relkit deploy destroy --stack development
```

`preview` is read-only. `up` applies the reviewed plan. `refresh` reconciles state,
and `destroy` removes stack-owned resources after confirmation. In automation,
`--non-interactive` and `--yes` choose the non-interactive path; they do not replace
review or authorization.

Supported backends are `cloud`, `local`, `s3://...`, `azblob://...`, and
`gs://...`. Use `--config-secret name=value` for Pulumi secret configuration.

## Generated plan

Preview and apply run `check` and `build`, then write:

```text
.relkit/generated/pulumi/Pulumi.yaml
.relkit/generated/pulumi/index.ts
.relkit/generated/pulumi/plan.json
```

Plan v3 contains the selected engine and host, connected runtime wiring,
infrastructure operations, and access operations. The generated Pulumi program
imports only the selected role exports and materializes provider-neutral operations.
Stable descriptor IDs own resource identity; moving a source file without changing
its ID does not replace the resource.

## AWS responsibilities

The AWS host integration owns the ECS/Fargate service, load balancer, networking,
workload role, and CloudWatch routing for redacted structured stdout. CloudWatch is
host logging, not an application telemetry exporter.

`aws(adapter, options)` owns application resources only for supported adapters:

| Binding                 | AWS infrastructure       | Access                            |
| ----------------------- | ------------------------ | --------------------------------- |
| `aws(s3(), options)`    | S3 bucket                | Least-privilege bucket operations |
| `aws(redis(), options)` | ElastiCache Redis/Valkey | Network/runtime connection wiring |

Unsupported adapter/infrastructure combinations fail before preview. Application
jobs, events, model providers, Sentry, and OTLP are not implicitly claimed by the AWS
host.

## Connected and local bindings

A configured adapter passed directly to `defineApp`, such as S3-compatible storage,
Redis, or a model endpoint, is connected. It contributes validated runtime wiring
but no resource lifecycle or implicit access operation. Removing it changes wiring,
not a remote resource.

`docker(adapter)` is development-only. `check` may include its deterministic local
recipe plan, but build and deployment never invoke Docker or translate containers
into cloud infrastructure. A local-only binding fails release validation until it
also has a connected or infrastructure source.

This separation permits AWS ECS to use connected Cloudflare, S3-compatible, Redis,
or model services without treating them as AWS-owned.

## Safety and cleanup

- Inspect every preview before `up`, replacement, or deletion.
- Use an isolated stack for tests and release evidence.
- Verify application health and non-secret outputs after apply.
- Run `refresh`, then `destroy`, for temporary acceptance stacks.
- Verify cleanup independently; a successful CLI exit is not cleanup evidence.
- Protect production internal endpoints and the Inspector API.

## Failures

Start with structured output:

```sh
relkit --json doctor --pulumi
relkit --json check
relkit --json deploy preview --stack development --non-interactive
```

Common plan codes include `RELKIT_DEPLOY_GRAPH_INVALID`,
`RELKIT_DEPLOY_GRAPH_VERSION_UNSUPPORTED`, `RELKIT_DEPLOY_PROFILE_UNSUPPORTED`,
`RELKIT_DEPLOY_ROLE_MISSING`, `RELKIT_DEPLOY_ROLE_INVALID`,
`RELKIT_DEPLOY_CONFIGURATION_MISSING`, `RELKIT_DEPLOY_SECRET_UNSUPPORTED`, and
`RELKIT_DEPLOY_LIVE_OBJECT_UNSUPPORTED`. Fix the first source or integration-export
error, rerun `check`, and preview again. Never edit the generated Pulumi program to
bypass graph or role validation.
