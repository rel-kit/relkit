import { expect, test } from "bun:test";
import createOrder from "../examples/events/create-order.function.js";
import orderConfirmation from "../examples/events/order-confirmation.function.js";
import orderConfirmationService from "../examples/events/order-confirmation.service.js";
import orderCreated from "../examples/events/order-created.event.js";
import queueReceipt from "../examples/jobs/queue-receipt.function.js";
import sendReceiptJob from "../examples/jobs/send-receipt.job.js";
import appExample from "../examples/landing/define-app.js";
import awsExample from "../examples/landing/aws-s3.js";
import catalogExample from "../examples/landing/catalog.js";
import redisExample from "../examples/landing/local-redis.js";
import telemetryExample from "../examples/landing/telemetry.js";

test("documentation examples are executable descriptors", () => {
  expect([orderCreated.kind, createOrder.kind, orderConfirmation.kind]).toEqual([
    "event",
    "function",
    "function",
  ]);
  expect(orderConfirmationService.kind).toBe("service");
  expect([sendReceiptJob.kind, queueReceipt.kind]).toEqual(["job", "function"]);
  expect(
    [appExample, awsExample, catalogExample, redisExample, telemetryExample].every(
      ({ kind }) => kind === "app",
    ),
  ).toBe(true);
});
