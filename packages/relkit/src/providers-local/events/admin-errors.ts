/** Preserves the public event admin error identity and stable error code. */
export class EventAdminError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EventAdminError";
  }
}
