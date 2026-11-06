/** Preserves the public job admin error identity and stable error code. */
export class JobAdminError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JobAdminError";
  }
}
