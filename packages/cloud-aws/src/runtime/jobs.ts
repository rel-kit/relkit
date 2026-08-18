import type { JobEnqueueOptions, JobOperationContext, JobProvider } from "@zsys/jobs";
import { assertResponse, awsRequest } from "./http.js";
import { credentials, text } from "./config.js";

export interface AwsJobOptions {
  readonly region: string;
  readonly queueUrl?: unknown;
  readonly endpoint?: unknown;
  readonly values?: Readonly<Record<string, unknown>> | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
}

export function createSqsJobProvider(options: AwsJobOptions): JobProvider {
  const queueUrl = text(options.queueUrl, "AWS job queueUrl");
  const endpoint =
    text(options.endpoint, "AWS SQS endpoint") ?? `https://sqs.${options.region}.amazonaws.com`;
  const auth = credentials(options.values);
  return Object.freeze({
    enqueue: async (input: unknown, request: JobEnqueueOptions, context: JobOperationContext) => {
      if (context.signal.aborted)
        throw context.signal.reason ?? new Error("Job operation cancelled");
      if (queueUrl === undefined) throw new Error("AWS job queueUrl is not configured");
      const body = new URLSearchParams({
        Action: "SendMessage",
        MessageBody: JSON.stringify({ input, correlationId: request.correlationId }),
        QueueUrl: queueUrl,
        Version: "2012-11-05",
      }).toString();
      const response = await awsRequest(endpoint, {
        service: "sqs",
        region: options.region,
        credentials: auth,
        fetch: options.fetch,
        init: {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        },
      });
      await assertResponse(response, "SQS enqueue");
      const xml = await response.text();
      const instanceId =
        xml.match(/<MessageId>([^<]+)<\/MessageId>/)?.[1] ?? `job-${crypto.randomUUID()}`;
      return { instanceId, accepted: true as const };
    },
  });
}
