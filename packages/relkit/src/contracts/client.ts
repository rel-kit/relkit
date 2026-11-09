export type {
  ClientIdentityDocument,
  ExpectedClientIdentity,
  JobsClientProtocol,
  OperationId,
  PendingOperationKind,
  PendingOperationMetadata,
  ReceiptLookup,
} from "./client.types.js";

export const CLIENT_IDENTITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  Vary: "Cookie, Authorization, Origin",
  "X-Content-Type-Options": "nosniff",
});
