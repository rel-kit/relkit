export class InspectorActionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly body: Record<string, unknown> | undefined;

  constructor(code: string, status: number, body?: Record<string, unknown>) {
    super(code);
    this.name = "InspectorActionError";
    this.code = code;
    this.status = status;
    this.body = body;
  }
}
