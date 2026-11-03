/** Canonical published package descriptions used by release metadata synchronization. */
import { POSITIONING } from "./positioning.js";

export const descriptions: Record<string, string> = {
  "@relkit/app": "Deprecated: RelKit is now the relkit package. This release re-exports relkit.",
  "@relkit/better-auth": "Better Auth integration for RelKit routes.",
  "@relkit/cli": "The RelKit development, build, inspection, and deployment CLI.",
  "@relkit/client-generator": "Unsupported internal RelKit client generator; use @relkit/app.",
  "@relkit/client": "Typed RelKit client helpers, including TanStack Query integration.",
  "@relkit/cloud-aws":
    "Unsupported internal AWS deployment components for RelKit; use @relkit/cli.",
  "@relkit/compiler": "Unsupported internal RelKit source compiler; use @relkit/cli.",
  "@relkit/deploy-pulumi":
    "Unsupported internal Pulumi deployment engine for RelKit; use @relkit/cli.",
  "@relkit/drizzle": "Drizzle ORM integration for RelKit functions.",
  "@relkit/inspector-api": "Internal live bridge and native jobs protocol for RelKit tooling.",
  "@relkit/inspector":
    "Standalone RelKit development inspector, collector, and local diagnostic history.",
  "@relkit/integrations": "Metadata-only catalog of independently selected RelKit integrations.",
  "@relkit/observability-local":
    "Explicit local diagnostic history and worker storage for RelKit inspection.",
  "@relkit/langchain": "Explicit native LangChain agent execution for RelKit.",
  "@relkit/providers-standard": "Empty compatibility package retained for RelKit tooling.",
  "@relkit/supervisor": "Unsupported internal RelKit process supervisor; use @relkit/cli.",
  "@relkit/testing": "Testing utilities and local providers for RelKit applications.",
  "@relkit/aws": "AWS host and infrastructure integration for RelKit.",
  "@relkit/cloudflare": "Cloudflare integration for RelKit.",
  "@relkit/docker": "Docker local-service integration for RelKit.",
  "@relkit/local": "Local-service orchestration integration for RelKit.",
  "@relkit/otlp": "OTLP telemetry integration for RelKit.",
  "@relkit/pulumi": "Pulumi deployment-engine integration for RelKit.",
  "@relkit/redis": "Redis integration for RelKit.",
  "@relkit/s3": "S3-compatible storage integration for RelKit.",
  "@relkit/sentry": "Sentry telemetry integration for RelKit.",
  "@relkit/inngest": "Inngest durable-jobs integration for RelKit.",
  "@relkit/trigger": "Trigger.dev jobs integration for RelKit.",
  "@relkit/effect-mq": "Effect MQ retryable-jobs integration for RelKit.",
  "create-relkit": POSITIONING,
  relkit: POSITIONING,
};
