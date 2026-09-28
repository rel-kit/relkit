/** Stable codes for wire validation, identity, and size errors. */
export type TaskWireErrorCode =
  | "RELKIT_TASK_WIRE_INVALID"
  | "RELKIT_TASK_INPUT_INVALID"
  | "RELKIT_TASK_OUTPUT_INVALID"
  | "RELKIT_TASK_INPUT_WIRE_NON_IDENTITY"
  | "RELKIT_TASK_INPUT_TOO_LARGE"
  | "RELKIT_TASK_OUTPUT_TOO_LARGE";
