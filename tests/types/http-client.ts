import type {
  OrdersGetError,
  OrdersGetInput,
  OrdersGetResult,
  OrdersGetStatus,
  OrdersGetSuccess,
} from "../integration/http/fixtures/orders.client.ts";

const input: OrdersGetInput = { note: "gift", orderId: "order-1" };
const success: OrdersGetSuccess = {
  status: 200,
  data: { orderId: input.orderId, totalCents: 100 },
};
const error: OrdersGetError = {
  status: 404,
  data: {
    code: "orders.not-found",
    data: { orderId: input.orderId },
    kind: "application",
    message: "Order not found",
    outcome: "declared-error",
    retry: "never",
    status: 404,
  },
};
const validation: OrdersGetResult = {
  status: 422,
  data: { error: "validation", issues: [] },
};
const status: OrdersGetStatus = validation.status;

void success;
void error;
void status;

// @ts-expect-error status inference excludes undeclared HTTP outcomes
const invalidStatus: OrdersGetStatus = 500;
// @ts-expect-error a declared error is not a successful result
const invalidSuccess: OrdersGetSuccess = error;
void invalidStatus;
void invalidSuccess;
