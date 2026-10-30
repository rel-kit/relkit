/**
 * Verifies the statically declared request-lifecycle edges: `calls-function`,
 * `uses-table` and `triggers-channel`. Sources are virtual; nothing executes.
 */
import { describe, expect, test } from "bun:test";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { defineChannel } from "../../packages/realtime/src/index.ts";
import { defineService } from "../../packages/services/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { accessFor } from "../../packages/compiler/src/normalize-source-usage.ts";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });
const handler = async () => ({ ok: true });
const ROOT = "/layout-virtual-project";

const FILES = {
  createTrip: "src/services/trips/functions/create-trip.function.ts",
  reportLocation: "src/services/trips/functions/report-location.function.ts",
  tripsService: "src/services/trips/service.ts",
  tripsRealtime: "src/services/trips/trips.realtime.ts",
  tripsShared: "src/services/trips/trips.shared.ts",
  dispatchChannel: "src/services/trips/channels/trip-dispatch.channel.ts",
  updatesChannel: "src/services/trips/channels/trip-updates.channel.ts",
  describe: "src/services/companies/functions/describe.function.ts",
  membership: "src/services/companies/functions/membership.function.ts",
  companiesService: "src/services/companies/service.ts",
  notify: "src/services/notifications/functions/notify.function.ts",
  onTripCreated: "src/services/notifications/functions/on-trip-created.function.ts",
  notificationsService: "src/services/notifications/service.ts",
  databaseService: "src/services/database/service.ts",
  middleware: "src/routes/middleware/trip-auth.middleware.ts",
} as const;

const createTrip = defineFunction({ id: "trips.create-trip", input, output, handler });
const reportLocation = defineFunction({ id: "trips.report-location", input, output, handler });
const describeCompany = defineFunction({ id: "companies.describe", input, output, handler });
const membership = defineFunction({ id: "companies.membership", input, output, handler });
const notify = defineFunction({ id: "notifications.notify", input, output, handler });
const onTripCreated = defineFunction({
  id: "notifications.on-trip-created",
  input,
  output,
  handler,
});
const tripDispatch = defineChannel({
  id: "trips.dispatch",
  params: z.object({}),
  events: { changed: z.object({}) },
});
const tripUpdates = defineChannel({
  id: "trips.updates",
  params: z.object({ userId: z.string() }),
  events: { changed: z.object({}) },
});
const trips = defineService({ id: "trips", functions: { createTrip, reportLocation } });
const companies = defineService({
  id: "companies",
  functions: { describe: describeCompany, membership },
});
const notifications = defineService({
  id: "notifications",
  functions: { notify, onTripCreated },
});
const table = (name: string) => ({
  name,
  databaseName: name,
  columns: [],
  selectors: [],
  customMethods: [],
});
const database = {
  kind: "service",
  id: "database",
  ref: { kind: "service", id: "database" },
  functions: {},
  capability: { kind: "drizzle", dialect: "sqlite", tables: [table("trips"), table("tripEvents")] },
};
const middleware = {
  kind: "middleware",
  id: "trip-auth",
  ref: { kind: "middleware", id: "trip-auth" },
  path: "/trips/*",
  handler: async () => undefined,
};

const descriptors = [
  createTrip,
  reportLocation,
  describeCompany,
  membership,
  notify,
  onTripCreated,
  tripDispatch,
  tripUpdates,
  trips,
  companies,
  notifications,
  database,
  middleware,
];
const locations = {
  "trips.create-trip": at(FILES.createTrip),
  "trips.report-location": at(FILES.reportLocation),
  "companies.describe": at(FILES.describe),
  "companies.membership": at(FILES.membership),
  "notifications.notify": at(FILES.notify),
  "notifications.on-trip-created": at(FILES.onTripCreated),
  "trips.dispatch": at(FILES.dispatchChannel),
  "trips.updates": at(FILES.updatesChannel),
  trips: at(FILES.tripsService),
  companies: at(FILES.companiesService),
  notifications: at(FILES.notificationsService),
  database: at(FILES.databaseService),
  "trip-auth": at(FILES.middleware),
};

function at(file: string) {
  return { file, line: 1, column: 1 };
}

const baseSources: Record<string, string> = {
  [FILES.tripsService]: `import { defineService } from "@relkit/app/services";
import createTrip from "./functions/create-trip.function.js";
import reportLocation from "./functions/report-location.function.js";
export default defineService({ id: "trips", functions: { createTrip, reportLocation } });`,
  [FILES.companiesService]: `import { defineService } from "@relkit/app/services";
import describe from "./functions/describe.function.js";
import membership from "./functions/membership.function.js";
export default defineService({ id: "companies", functions: { describe, membership } });`,
  [FILES.notificationsService]: `import { defineService } from "@relkit/app/services";
import notify from "./functions/notify.function.js";
import onTripCreated from "./functions/on-trip-created.function.js";
export default defineService({ id: "notifications", functions: { notify, onTripCreated } });`,
  [FILES.databaseService]: `import { defineDrizzleService } from "@relkit/drizzle";
export default defineDrizzleService({ schema: {}, client: () => ({}) });`,
  [FILES.dispatchChannel]: `import { defineChannel } from "@relkit/app/realtime";
export default defineChannel({ id: "trips.dispatch", params: {}, events: {} });`,
  [FILES.updatesChannel]: `import { defineChannel } from "@relkit/app/realtime";
export default defineChannel({ id: "trips.updates", params: {}, events: {} });`,
  [FILES.tripsShared]: `export const toTripDto = (row: unknown) => row;
export const helperThing = { trigger: async () => undefined };`,
  [FILES.tripsRealtime]: `import tripDispatch from "./channels/trip-dispatch.channel.js";
import tripUpdates from "./channels/trip-updates.channel.js";
export async function publishTripChanged(trip: { requestedBy: string }) {
  await tripDispatch.trigger({}, "changed", trip);
  await tripUpdates.trigger({ userId: trip.requestedBy }, "changed", trip);
}`,
  [FILES.describe]: `import { defineFunction } from "@relkit/app/functions";
export default defineFunction({ id: "companies.describe", handler: async () => ({ ok: true }) });`,
  [FILES.membership]: `import { defineFunction } from "@relkit/app/functions";
export default defineFunction({ id: "companies.membership", handler: async () => ({ ok: true }) });`,
  [FILES.notify]: `import { defineFunction } from "@relkit/app/functions";
export default defineFunction({
  id: "notifications.notify",
  handler: async (input, context) => {
    await context.database.notifications.insert({ data: input });
    return { ok: true };
  },
});`,
  [FILES.onTripCreated]: `import { defineFunction } from "@relkit/app/functions";
import users from "../../companies/service.js";
import notify from "./notify.function.js";
export default defineFunction({
  id: "notifications.on-trip-created",
  handler: async (input) => {
    await users.describe.invoke({ companyId: input.id });
    await notify.invoke({ userId: input.id });
    return { ok: true };
  },
});`,
  [FILES.createTrip]: `import { defineFunction } from "@relkit/app/functions";
import companies from "../../companies/service.js";
import { publishTripChanged } from "../trips.realtime.js";
import { toTripDto } from "../trips.shared.js";
export default defineFunction({
  id: "trips.create-trip",
  handler: async (input, context) => {
    const company = await companies.describe.invoke({ companyId: input.id });
    const member = await companies.membership.invoke({ companyId: input.id, userId: "u" });
    const trip = await context.database.transaction(async (db) => {
      const row = await db.trips.insert({ data: { id: input.id } });
      await db.tripEvents.insert({ data: { tripId: row.id } });
      return toTripDto(row);
    });
    await publishTripChanged(trip);
    return { ok: company !== null && member !== null };
  },
});`,
  [FILES.reportLocation]: `import { defineFunction } from "@relkit/app/functions";
import { publishTripChanged } from "../trips.realtime.js";
export default defineFunction({
  id: "trips.report-location",
  handler: async (input, context) => {
    const trip = await context.database.trips.findOne({ where: { id: input.id } });
    await publishTripChanged(trip);
    return { ok: true };
  },
});`,
  [FILES.middleware]: `import trips from "../../services/trips/service.js";
export default async function tripAuth(context) {
  await trips.createTrip.invoke({ id: "x" });
}`,
};

function compile(overrides: Record<string, string> = {}) {
  const sources = Object.entries({ ...baseSources, ...overrides }).map(([fileName, text]) => ({
    fileName,
    text,
  }));
  return normalizeCompilation({ projectRoot: ROOT, descriptors, locations, sources });
}

function edgesOf(result: ReturnType<typeof compile>, kind: string) {
  return (result.graph?.edges ?? []).filter((edge) => edge.kind === kind);
}

describe("declared source usage edges", () => {
  test("classifies drizzle model methods", () => {
    expect(accessFor("insert")).toBe("write");
    expect(accessFor("upsert")).toBe("write");
    expect(accessFor("findMany")).toBe("read");
    expect(accessFor("count")).toBe("read");
    expect(accessFor("parse")).toBeUndefined();
    expect(accessFor("transaction")).toBeUndefined();
  });

  test("records service-member and direct function invocations", () => {
    const result = compile();
    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(edgesOf(result, "calls-function")).toEqual([
      { kind: "calls-function", from: "notifications.on-trip-created", to: "companies.describe" },
      { kind: "calls-function", from: "notifications.on-trip-created", to: "notifications.notify" },
      { kind: "calls-function", from: "trips.create-trip", to: "companies.describe" },
      { kind: "calls-function", from: "trips.create-trip", to: "companies.membership" },
    ]);
  });

  test("records table reads and writes, including transaction callbacks", () => {
    const result = compile();
    expect(edgesOf(result, "uses-table")).toEqual([
      {
        kind: "uses-table",
        from: "trips.create-trip",
        to: "database",
        table: "tripEvents",
        access: "write",
      },
      {
        kind: "uses-table",
        from: "trips.create-trip",
        to: "database",
        table: "trips",
        access: "write",
      },
      {
        kind: "uses-table",
        from: "trips.report-location",
        to: "database",
        table: "trips",
        access: "read",
      },
    ]);
  });

  test("records direct and helper-attributed channel triggers", () => {
    const result = compile({
      [FILES.reportLocation]: `import { defineFunction } from "@relkit/app/functions";
import tripUpdates from "../channels/trip-updates.channel.js";
export default defineFunction({
  id: "trips.report-location",
  handler: async (input) => {
    await tripUpdates.trigger({ userId: input.id }, "changed", {});
    return { ok: true };
  },
});`,
    });
    expect(edgesOf(result, "triggers-channel")).toEqual([
      { kind: "triggers-channel", from: "trips.create-trip", to: "trips.dispatch" },
      { kind: "triggers-channel", from: "trips.create-trip", to: "trips.updates" },
      { kind: "triggers-channel", from: "trips.report-location", to: "trips.updates" },
    ]);
  });

  test("ignores unresolvable, non-descriptor, and non-service usage", () => {
    const result = compile({
      [FILES.createTrip]: `import { defineFunction } from "@relkit/app/functions";
import companies from "../../companies/service.js";
import { helperThing } from "../trips.shared.js";
const target = "../trips.realtime.js";
export default defineFunction({
  id: "trips.create-trip",
  handler: async (input, context) => {
    const realtime = await import(target);
    await companies.unknown.invoke({});
    const local = { invoke: async () => undefined };
    await local.invoke();
    const data = context.database.zodSchemas.trips.insert.parse({ id: input.id });
    const db = makeThing();
    await db.trips.insert({ data });
    await helperThing.trigger();
    return { ok: realtime !== undefined };
  },
});`,
    });
    expect(edgesOf(result, "calls-function")).toEqual([
      { kind: "calls-function", from: "notifications.on-trip-created", to: "companies.describe" },
      { kind: "calls-function", from: "notifications.on-trip-created", to: "notifications.notify" },
    ]);
    expect(edgesOf(result, "uses-table")).toEqual([
      {
        kind: "uses-table",
        from: "trips.report-location",
        to: "database",
        table: "trips",
        access: "read",
      },
    ]);
    expect(edgesOf(result, "triggers-channel")).toEqual([
      { kind: "triggers-channel", from: "trips.report-location", to: "trips.dispatch" },
      { kind: "triggers-channel", from: "trips.report-location", to: "trips.updates" },
    ]);
    expect(
      (result.graph?.edges ?? []).some(
        (edge) => edge.kind === "calls-function" && edge.from === "trip-auth",
      ),
    ).toBe(false);
  });

  test("emits no table edges without a drizzle service", () => {
    const result = normalizeCompilation({
      projectRoot: ROOT,
      descriptors: descriptors.filter((descriptor) => descriptor !== database),
      locations,
      sources: Object.entries(baseSources)
        .filter(([fileName]) => fileName !== FILES.databaseService)
        .map(([fileName, text]) => ({ fileName, text })),
    });
    expect(edgesOf(result, "uses-table")).toEqual([]);
    expect(edgesOf(result, "triggers-channel")).toHaveLength(4);
  });
});
