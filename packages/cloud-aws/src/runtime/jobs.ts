import type { JsonValue } from "@zsys/contracts";
import type { JobQueueFactoryContext, JobQueueHandle } from "@zsys/engine";
import type { JobEnqueueOptions, JobOperationContext, JobProvider } from "@zsys/jobs";
import { type AwsCredentials, text } from "./config.js";
import { assertResponse, awsRequest } from "./http.js";

export interface AwsJobOptions {
  readonly region: string;
  readonly queueUrl?: unknown;
  readonly endpoint?: unknown;
  readonly credentials?: AwsCredentials;
  readonly fetch?: typeof globalThis.fetch | undefined;
}

export interface AwsJobProvider extends JobProvider {
  readonly createQueue: (context: JobQueueFactoryContext) => JobQueueHandle;
}

export function createSqsJobProvider(options: AwsJobOptions): AwsJobProvider {
  const queueUrl = text(options.queueUrl, "AWS job queueUrl");
  const endpoint =
    text(options.endpoint, "AWS SQS endpoint") ?? `https://sqs.${options.region}.amazonaws.com`;
  const auth = options.credentials;
  const request = async (values: Record<string, string>, operation: string): Promise<string> => {
    if (queueUrl === undefined) throw new Error("AWS job queueUrl is not configured");
    const response = await awsRequest(endpoint, {
      service: "sqs",
      region: options.region,
      credentials: auth,
      fetch: options.fetch,
      init: {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          ...values,
          QueueUrl: queueUrl,
          Version: "2012-11-05",
        }).toString(),
      },
    });
    await assertResponse(response, operation);
    return response.text();
  };
  const send = async (input: unknown, correlationId?: string) => {
    const xml = await request(
      { Action: "SendMessage", MessageBody: JSON.stringify({ input, correlationId }) },
      "SQS enqueue",
    );
    return decodeXml(
      xml.match(/<MessageId>([^<]+)<\/MessageId>/)?.[1] ?? `job-${crypto.randomUUID()}`,
    );
  };
  return Object.freeze({
    enqueue: async (
      input: unknown,
      requestOptions: JobEnqueueOptions,
      context: JobOperationContext,
    ) => {
      if (context.signal.aborted)
        throw context.signal.reason ?? new Error("Job operation cancelled");
      return {
        instanceId: await send(input, requestOptions.correlationId ?? context.correlationId),
        accepted: true as const,
      };
    },
    createQueue: (context: JobQueueFactoryContext) => createQueue(context, request, send),
  });
}

function createQueue(
  context: JobQueueFactoryContext,
  request: (values: Record<string, string>, operation: string) => Promise<string>,
  send: (input: unknown, correlationId?: string) => Promise<string>,
): JobQueueHandle {
  type Entry = Awaited<ReturnType<JobQueueHandle["enqueue"]>>;
  const entries = new Map<string, Entry>();
  const receipts = new Map<string, string>();
  let order = 0;
  const enqueue = async (value: Parameters<JobQueueHandle["enqueue"]>[0]): Promise<Entry> => {
    const instanceId = await send(value.input);
    const acceptedAt = value.acceptedAt ?? Date.now();
    const entry = Object.freeze({
      instanceId,
      accepted: true as const,
      duplicate: false,
      state: "available" as const,
      input: value.input,
      profile: context.profile,
      attempt: 0,
      acceptedAt,
      availableAt: acceptedAt,
      order: ++order,
    });
    entries.set(instanceId, entry);
    return entry;
  };
  const acquire = async (): Promise<Entry | undefined> => {
    const xml = await request(
      {
        Action: "ReceiveMessage",
        MaxNumberOfMessages: "1",
        AttributeName: "ApproximateReceiveCount",
      },
      "SQS receive",
    );
    const message = xml.match(/<Message>([\s\S]*?)<\/Message>/)?.[1];
    if (message === undefined) return undefined;
    const instanceId = field(message, "MessageId") ?? `job-${crypto.randomUUID()}`;
    const body = field(message, "Body");
    const parsed = body === undefined ? {} : (JSON.parse(body) as { readonly input?: JsonValue });
    const receipt = field(message, "ReceiptHandle");
    if (receipt !== undefined) receipts.set(instanceId, receipt);
    const entry = Object.freeze({
      instanceId,
      accepted: true as const,
      duplicate: false,
      state: "leased" as const,
      input: parsed.input ?? null,
      profile: context.profile,
      attempt: Number(field(message, "ApproximateReceiveCount") ?? "1"),
      acceptedAt: Date.now(),
      order: ++order,
    });
    entries.set(instanceId, entry);
    return entry;
  };
  const transition = async (
    instanceId: string,
    state: Parameters<JobQueueHandle["transition"]>[1],
    transitionOptions: Parameters<JobQueueHandle["transition"]>[2] = {},
  ): Promise<Entry> => {
    const current = entries.get(instanceId);
    if (current === undefined) throw new Error(`SQS job ${instanceId} is unknown`);
    const receipt = receipts.get(instanceId);
    if (receipt !== undefined && (state === "completed" || state === "dead-lettered"))
      await request({ Action: "DeleteMessage", ReceiptHandle: receipt }, "SQS acknowledge");
    if (receipt !== undefined && state === "delayed") {
      const seconds = Math.max(
        0,
        Math.ceil(((transitionOptions.availableAt ?? Date.now()) - Date.now()) / 1_000),
      );
      await request(
        {
          Action: "ChangeMessageVisibility",
          ReceiptHandle: receipt,
          VisibilityTimeout: String(seconds),
        },
        "SQS retry",
      );
    }
    const entry = Object.freeze({ ...current, state, ...transitionOptions }) as Entry;
    entries.set(instanceId, entry);
    return entry;
  };
  return Object.freeze({
    ready: async () => undefined,
    enqueue,
    acquire,
    transition,
    get: (id) => entries.get(id),
  });
}

function field(xml: string, name: string): string | undefined {
  const value = xml.match(new RegExp(`<${name}>([^<]*)<\\/${name}>`))?.[1];
  return value === undefined ? undefined : decodeXml(value);
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
