/** Trusted launch inputs; none are accepted from a browser request. */
export interface InspectorOptions {
  readonly projectRoot?: string;
  readonly connectionFile?: string;
  readonly credentialFile?: string;
  readonly target?: string;
  readonly historyDirectory?: string;
  readonly hostname: string;
  readonly port: number;
}
