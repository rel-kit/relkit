import { waitFor, type NativeStack } from "./native-stack.ts";

export type NativeRun = {
  readonly run_id: string;
  readonly status: string;
  readonly [key: string]: unknown;
};

export type NativeSleep = {
  readonly stepName: string;
  readonly attempt: number;
  readonly sleep: string;
  readonly createdAt: string;
};

const ulidHex = (value: string) => {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let decoded = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error(`Invalid ULID: ${value}`);
    decoded = (decoded << 5n) | BigInt(digit);
  }
  return (decoded & ((1n << 128n) - 1n)).toString(16).padStart(32, "0");
};

export function createNativeApi(stack: NativeStack) {
  const api = async (path: string): Promise<Record<string, unknown>> => {
    const response = await fetch(`${stack.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${stack.signingKey}` },
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`Inngest API ${path} returned ${response.status}: ${JSON.stringify(body)}`);
    }
    return body;
  };
  const eventRuns = async (eventId: string) => {
    const body = await api(`/v2/events/${encodeURIComponent(eventId)}/runs?limit=40`);
    const rows = Array.isArray(body.data) ? body.data : [];
    return rows.map((value) => {
      const row = value as Record<string, unknown>;
      return { ...row, run_id: String(row.id), status: String(row.status) } as NativeRun;
    });
  };
  const run = async (runId: string) =>
    (await api(`/v1/runs/${encodeURIComponent(runId)}`)).data as NativeRun;
  const sleepHistory = async (runId: string) =>
    JSON.parse(
      await stack.queryPostgres(
        `select coalesce(json_agg(json_build_object('stepName', step_name, 'attempt', attempt, 'sleep', sleep, 'createdAt', created_at) order by created_at), '[]'::json) from history where run_id = decode('${ulidHex(runId)}', 'hex') and sleep is not null`,
      ),
    ) as NativeSleep[];
  const waitForRun = (runId: string) =>
    waitFor(
      `terminal run ${runId}`,
      async () => {
        const value = await run(runId);
        return ["Completed", "Failed", "Cancelled"].includes(value.status) ? value : false;
      },
      45_000,
    );
  return { api, eventRuns, run, sleepHistory, waitForRun };
}
