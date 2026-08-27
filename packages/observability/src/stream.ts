import type { JsonValue } from "@relkit/contracts";
import type { ObservabilityRecord } from "./model.js";
import { admitRecord } from "./redaction.js";
import { admitObservabilityRecord } from "./record-admission.js";
import { createStreamSubscriber, type StreamSubscriber } from "./stream-subscriber.js";
import {
  OBSERVABILITY_STREAM_EVENT_TYPES,
  ObservabilityStreamError,
  type ObservabilityStream,
  type ObservabilityStreamEvent,
  type ObservabilityStreamEventType,
  type ObservabilityStreamInput,
  type ObservabilityStreamOptions,
  type ObservabilityStreamPage,
  type ObservabilityStreamPublish,
  type ObservabilityStreamRecordPublisher,
  type ObservabilityStreamReplay,
  type ObservabilityStreamReplayOptions,
  type ObservabilityStreamStats,
  type ObservabilityStreamSubscriptionOptions,
  DEFAULT_STREAM_MAX_EVENTS,
  DEFAULT_STREAM_MAX_QUEUE_SIZE,
  DEFAULT_STREAM_MAX_SUBSCRIBERS,
  DEFAULT_STREAM_QUEUE_SIZE,
} from "./stream-types.js";
import {
  assertType,
  bounded,
  invalid,
  positive,
  resolveCursor,
  validateCursor,
} from "./stream-utils.js";

export * from "./stream-types.js";

export function createObservabilityStream(
  options: ObservabilityStreamOptions = {},
): ObservabilityStream {
  const maxEvents = positive(options.maxEvents ?? DEFAULT_STREAM_MAX_EVENTS, "retention");
  const maxQueueSize = positive(
    options.maxQueueSize ?? DEFAULT_STREAM_MAX_QUEUE_SIZE,
    "queue maximum",
  );
  const queueSize = bounded(options.queueSize ?? DEFAULT_STREAM_QUEUE_SIZE, maxQueueSize, "queue");
  const maxSubscribers = positive(
    options.maxSubscribers ?? DEFAULT_STREAM_MAX_SUBSCRIBERS,
    "subscriber",
  );
  const overflow = options.overflow ?? options.backpressure ?? "drop-oldest";
  const events: ObservabilityStreamEvent[] = [];
  const subscribers = new Map<string, StreamSubscriber>();
  let sequence = 0;
  let retainedDropped = 0;
  let subscriberDropped = 0;
  let subscriberSequence = 0;
  let closed = false;

  const append = (
    type: ObservabilityStreamEventType,
    data: JsonValue,
  ): ObservabilityStreamEvent => {
    if (closed)
      throw new ObservabilityStreamError("RELKIT_OBSERVABILITY_STREAM_CLOSED", "Stream is closed");
    if (sequence === Number.MAX_SAFE_INTEGER) throw invalid("stream cursor exhausted");
    const event = Object.freeze({
      protocol: "relkit.observability.stream" as const,
      version: 1 as const,
      cursor: String(++sequence),
      type,
      data,
    });
    if (events.length === maxEvents) {
      events.shift();
      retainedDropped += 1;
    }
    events.push(event);
    for (const subscriber of subscribers.values()) subscriber.enqueue(event);
    return event;
  };

  const publish = ((
    inputOrType: ObservabilityStreamInput | ObservabilityStreamEventType,
    record?: ObservabilityRecord,
  ) => {
    const input: ObservabilityStreamInput =
      typeof inputOrType === "string" ? { type: inputOrType, record: record! } : inputOrType;
    assertType(input.type);
    const data =
      "record" in input ? admitModel(input.record) : admitRecord(input.data, options.redaction);
    return data === undefined ? undefined : append(input.type, data as JsonValue);
  }) as ObservabilityStreamPublish;
  const publishRecord = ((type: ObservabilityStreamEventType, record: ObservabilityRecord) =>
    publish({ type, record })) as ObservabilityStreamRecordPublisher;

  const replay = ((
    value?: ObservabilityStreamReplayOptions | string,
    limitValue?: number,
  ): ObservabilityStreamPage => {
    const input =
      typeof value === "string" || value === undefined
        ? {
            ...(value === undefined ? {} : { cursor: value }),
            ...(limitValue === undefined ? {} : { limit: limitValue }),
          }
        : value;
    const cursor = resolveCursor(input);
    const limit = bounded(input.limit ?? maxEvents, maxEvents, "replay");
    if (cursor !== undefined) validateCursor(cursor, sequence, events[0]?.cursor);
    const after = cursor === undefined ? 0 : Number(cursor);
    const matched = events.filter(
      (event) =>
        Number(event.cursor) > after && (input.type === undefined || event.type === input.type),
    );
    const page = matched.slice(0, limit);
    return Object.freeze({
      protocol: "relkit.observability.stream" as const,
      version: 1 as const,
      events: Object.freeze(page),
      ...(page.length < matched.length ? { nextCursor: page.at(-1)!.cursor } : {}),
      ...(events[0] === undefined ? {} : { earliestCursor: events[0].cursor }),
      latestCursor: String(sequence),
    });
  }) as ObservabilityStreamReplay;

  const subscribe = (input: ObservabilityStreamSubscriptionOptions = {}) => {
    if (closed)
      throw new ObservabilityStreamError("RELKIT_OBSERVABILITY_STREAM_CLOSED", "Stream is closed");
    if (subscribers.size >= maxSubscribers) throw invalid("stream subscriber limit reached");
    const cursor = resolveCursor(input);
    const page = replay({ ...(cursor === undefined ? {} : { cursor }), limit: maxEvents });
    let subscriber: StreamSubscriber;
    const overflowValue = input.overflow ?? input.backpressure ?? overflow;
    subscriber = createStreamSubscriber(
      `subscriber-${++subscriberSequence}`,
      bounded(input.queueSize ?? queueSize, maxQueueSize, "queue"),
      overflowValue,
      () => subscribers.delete(subscriber.id),
      (count) => {
        subscriberDropped += count;
      },
    );
    subscribers.set(subscriber.id, subscriber);
    for (const event of page.events) subscriber.enqueue(event);
    return subscriber;
  };

  const counters = () => ({
    published: sequence,
    retainedDropped,
    subscriberDropped,
    dropped: retainedDropped + subscriberDropped,
  });
  const stats = (): ObservabilityStreamStats => ({
    ...counters(),
    retained: events.length,
    subscribers: subscribers.size,
    cursor: String(sequence),
    ...(events[0] === undefined ? {} : { earliestCursor: events[0].cursor }),
  });
  const close = (): void => {
    if (closed) return;
    closed = true;
    for (const subscriber of [...subscribers.values()]) subscriber.close();
    subscribers.clear();
  };
  return Object.freeze({
    publish,
    emit: publish,
    publishRecord,
    replay,
    read: replay,
    subscribe,
    dropped: () => counters().dropped,
    counters,
    stats,
    close,
  });

  function admitModel(record: ObservabilityRecord): JsonValue | undefined {
    if (options.collector === undefined)
      return admitObservabilityRecord(record, options.redaction) as JsonValue | undefined;
    const accepted = options.collector.collect(record);
    return accepted === undefined ? undefined : (accepted as unknown as JsonValue);
  }
}
