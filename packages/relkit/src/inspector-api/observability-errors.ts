/** Established TypeError configuration contract used by synchronous native installers. */
export class ObservabilityEndpointConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ObservabilityEndpointConfigurationError";
  }
}

/** Private native observation parameter failure mapped into its public HTTP envelope. */
export class EndpointError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
