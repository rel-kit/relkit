export class RelkitWriteError extends Error {
  constructor(
    readonly outcome: "not-sent" | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "RelkitWriteError";
  }
}
