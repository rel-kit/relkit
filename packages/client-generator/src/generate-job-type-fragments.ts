/** Fixed client type fragments shared by generated job procedures. */
export const getInputType =
  '{ readonly runId: string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
export const listInputType =
  '{ readonly query?: import("@relkit/client/jobs").JobListQuery; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
export const watchInputType =
  '{ readonly runId: string; readonly after?: string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
export const cancelInputType =
  '{ readonly runId: string; readonly operationId: import("@relkit/contracts").OperationId | string; readonly reason?: string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
export const retryInputType =
  '{ readonly runId: string; readonly operationId: import("@relkit/contracts").OperationId | string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
export const runHandleType = 'import("@relkit/contracts/jobs").RunHandle';
export const cancelOutputType = 'import("@relkit/contracts/jobs").RunCancellationReceipt';
export const retryOutputType = 'import("@relkit/contracts/jobs").RunRetryReceipt';
