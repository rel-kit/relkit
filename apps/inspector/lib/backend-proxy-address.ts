/** The address the Inspector UI was started on, as the tool passes it in `HOSTNAME` and `PORT`. */
export type InspectorAddress = {
  /** Bind host, lower case and without brackets; undefined when the process was not given one. */
  readonly host: string | undefined;
  /** Listening port; undefined when the process was not given one (for example `next dev`). */
  readonly port: string | undefined;
};

const LOOPBACK_NAMES = new Set(["127.0.0.1", "localhost", "::1"]);
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::"]);

export function inspectorAddressFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): InspectorAddress {
  const host = env["HOSTNAME"]
    ?.trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  const port = env["PORT"]?.trim();
  return {
    host: host === undefined || host === "" ? undefined : host,
    port: port !== undefined && /^\d{1,5}$/.test(port) ? String(Number(port)) : undefined,
  };
}

/**
 * Tells whether a `Host` header names this Inspector. A DNS-rebinding page reaches the loopback
 * listener under the attacker's own name, so the name is what is checked: a loopback spelling, the
 * configured bind host, or, when the Inspector listens on every interface, an address literal (a
 * browser sends a name for a DNS name, never an address). The port must match the Inspector's own
 * unless it listens on every interface, where a container publishes it on another port.
 */
export function isOwnInspectorHost(hostHeader: string, address: InspectorAddress): boolean {
  const parsed = parseHost(hostHeader);
  if (parsed === undefined) return false;
  const wildcard = address.host !== undefined && WILDCARD_HOSTS.has(address.host);
  if (address.port !== undefined && !wildcard && parsed.port !== address.port) return false;
  if (LOOPBACK_NAMES.has(parsed.name)) return true;
  if (address.host !== undefined && !wildcard && parsed.name === address.host) return true;
  return wildcard && isAddressLiteral(parsed.name);
}

function parseHost(value: string): { readonly name: string; readonly port: string } | undefined {
  try {
    const url = new URL(`http://${value}`);
    if (url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "")
      return undefined;
    return { name: url.hostname.replace(/^\[|\]$/g, ""), port: url.port === "" ? "80" : url.port };
  } catch {
    return undefined;
  }
}

function isAddressLiteral(name: string): boolean {
  return name.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(name);
}
