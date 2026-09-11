# Relkit Streaming, Realtime, Typed Client, and Agent Runtime — Consolidated Implementation Specification

**Status:** Approved architectural baseline and implementation specification.  
**Review date:** September 7, 2026.  
**Relkit baseline:** `602b54ddd84b65b1bdfd2098adfa6876b2abc1ba`; confirmed as `main` during this review.  
**Pi review baseline:** `e687434a60174db1a9c961d973881a7a851a0597`, specifically `packages/agent`.  
**Audience:** Engineers implementing the feature, reviewers approving each phase, and documentation authors.

> Backend code triggers typed events. Clients select exposed routes, channels, and agents by generated names. Relkit manages connections, typed contracts, and recovery. Access policies, presence semantics, and safe execution guarantees are explicit.

This is the sole authoritative specification for generic streams, native streaming,
typed clients, channels, presence, agents, Inspector, providers, examples,
documentation, and their lifecycle and security guarantees. Earlier revisions and
the consolidation handoff are non-normative history. Baseline commit:
602b54ddd84b65b1bdfd2098adfa6876b2abc1ba. No OpenSpec artifact is part of
this implementation.

All new exports, descriptor fields, diagnostics, endpoint families, paths marked **new**, and CLI behavior below are implementation requirements—not claims about shipped features. Example application functions such as `canReadOrder` and `resolveViewerInfo` are application-owned descriptors, not framework built-ins.

## 1. Decisions at a glance

| Area | Decision |
|---|---|
| Backend realtime | `channel.trigger(params, event, data, options?)`. No transport objects in business functions. |
| Channel access | Omitted `client` means internal; `client: { public: true }` is explicitly public; `client: { authorize: guard }` is protected. |
| Browser realtime | `useChannel(name, options)`; imperative `subscribe` / `bind` remains available through `useRealtime()`. |
| Presence | Opt-in. Count-only reports connections; member presence separately reports distinct authenticated members and safe member information. |
| React setup | `RelkitClientProvider` owns the client runtime and integrates a TanStack `QueryClient`. |
| Route reads | `useRoute('GET /orders/:orderId', { input, ...queryOptions })`, returning the real TanStack query result. |
| Route writes | `useRouteMutation('PATCH /orders/:orderId', mutationOptions)`, returning the real TanStack mutation result. |
| Advanced route reads | `useInfiniteRoute`, `useSuspenseRoute`, and URL-indexed `useRouteUtils`. |
| Frontend contracts | Compiler-generated registry and manifest are included automatically; no imports from `../generated`. |
| Agent selection | `useAgent('orders.assistant', { threadId, input })`. |
| Agent protocol | Use a version-pinned AG-UI event profile and a real AG-UI interoperability endpoint. Offer a separately tested AI SDK UI Message Stream adapter. |
| Pi influence | Adopt lifecycle, partial tool input/progress, steering, follow-up, safe turn boundaries, and context/message separation. Do not replace Relkit's function engine or adopt Pi as a mandatory dependency. |
| Recovery | Distinguish reconnect, replay, state restoration, approval continuation, and worker-crash recovery. |
| Documentation | New Client and Realtime sections; expand HTTP, AI, Inspector, operations, examples, and generated API references in the same implementation phases. |

The URL selector is an application route identity, not an instruction to bypass oRPC. Relkit maps it to the existing exposed oRPC procedure behind the scenes. Channel and agent hooks continue using resource IDs such as `orders.updates` and `orders.assistant`.

## 2. Verified baseline and compatibility work

The current `@relkit/client` package already depends on `@orpc/tanstack-query` at `2.0.0-beta.31`, alongside the matching oRPC client/contract packages. Its `./tanstack-query` entry point currently re-exports `createTanstackQueryUtils`; React hooks and a React provider are additions. `@relkit/agents` currently declares `ai: 7.0.79`. [R1] [R2] [R3]

Relkit's existing default contract registry and generator provide the starting point for automatic module augmentation. Extend that machinery rather than introducing a second independent type generator. Route procedures must continue entering the common engine and retaining middleware, validation, error mapping, authentication, limits, and telemetry. [R4] [R5] [R6]

Official oRPC documentation provides query, mutation, infinite, streamed, and live query utilities. Use those utilities under Relkit's hooks instead of copying their cache-key or serializer implementations. Upstream documentation is not proof that every current example matches the pinned package: phase 0 must verify exact installed exports and behavior. [O1]

The AG-UI source reviewed includes interrupt-aware run outcomes, activity events, metadata, and subagent events. Its inspected core package declares `0.0.59`; this is a source observation, not a claim that all main-branch changes are included in a particular published tarball. Pin and test the actual package artifacts before shipping protocol compatibility. [G2] [G4] [G5]

### Phase-0 compatibility record

Create `docs/specs/realtime-compatibility.md` with the resolved Bun, Hono, oRPC, TanStack Query, AI SDK, and AG-UI versions; the source commits; supported protocol profiles; and results of the following spikes:

1. Stream one validated iterator through the current oRPC Fetch handler hosted by Hono; consume it incrementally and abort it.
2. Exercise WebSocket upgrade and streaming using the actual Bun server entry point, not only an in-process HTTP test.
3. Generate real TanStack query/mutation options and verify cancellation, error inference, query keys, `select`, and infinite-page inference.
4. Feed the selected AG-UI package a fixture containing text, tool arguments, results, snapshots, and interrupt/resume lifecycle events.
5. Feed the optional AI SDK adapter to the installed AI SDK UI parser, including tool approvals and streamed tool output.

Do not silently upgrade the complete AI/oRPC stack as part of a UI feature. Any necessary upgrade has its own compatibility tests and changeset.

## 3. Protected, public, and internal channels

### 3.1 Preserve a small, explicit API

```ts
// Internal: backend consumers only.
defineChannel({
  id: 'internal.metrics',
  params: z.object({}),
  events: { sampled: MetricsSample },
});

// Public: anonymous subscription is deliberately allowed.
defineChannel({
  id: 'announcements',
  params: z.object({}),
  events: { published: Announcement },
  client: { public: true },
});

// Protected: authentication plus application authorization.
defineChannel({
  id: 'orders.updates',
  params: z.object({ orderId: z.string() }),
  events: { 'status.changed': OrderStatusChanged },
  client: { authorize: canReadOrder },
});
```

Conceptual descriptor union:

```ts
type ChannelClientPolicy<Guard> =
  | { readonly public: true; readonly authorize?: never }
  | { readonly authorize: Guard; readonly public?: never };
```

Reject `client: {}`, `public: false`, and simultaneous `public` / `authorize`. Omitting `client` is the single internal/private-to-the-server default. A protected channel without a working authentication resolver must fail closed, with a startup diagnostic where detectable.

The compiler—not a `private-` prefix supplied by the browser—determines the policy. Pusher uses private-channel authorization and a prefix convention; Relkit keeps the server authorization principle without requiring name prefixes or Pusher wire compatibility. [P1]

A channel with public access exposes every event in that channel partition to its subscribers. Client-side event binding is not an authorization filter. Split public and sensitive events into separately authorized channels; do not place a private event on a public channel and hide its handler in the UI.

### 3.2 Complete backend example

```ts
// src/orders/channels/updates.channel.ts
import { defineChannel } from '@relkit/app/realtime';
import { z } from '@relkit/app/schema';
import { canReadOrder } from '../functions/can-read-order.function.js';

export const updates = defineChannel({
  id: 'orders.updates',
  params: z.object({ orderId: z.string() }),
  events: {
    'status.changed': z.object({
      status: z.enum(['pending', 'paid', 'shipped', 'delivered']),
      revision: z.number().int().nonnegative(),
    }),
  },
  client: { authorize: canReadOrder },
  presence: 'count',
  replay: { retentionMs: 300_000 },
});
```

`canReadOrder` is a normal function descriptor with input matching the channel params and a boolean output. It obtains the authenticated principal from trusted invocation context and verifies actual order access. Exceptions, timeouts, and malformed results deny access. A signed-in user is not automatically entitled to every order.

The example assumes globally unique order IDs. Tenant-local IDs require a tenant discriminator in the partition key and explicit authorization against the authenticated tenant. A tenant supplied in params is untrusted input.

```ts
// Inside a route-target function, job, service function, or function-backed tool:
await updates.trigger(
  { orderId: savedOrder.id },
  'status.changed',
  { status: savedOrder.status, revision: savedOrder.revision },
);
```

Trigger receipt means provider acceptance under its declared durability guarantees, not browser receipt or an exactly-once business transaction. Use an application transaction/outbox and stable event ID where missing the notification is unacceptable. This feature does not introduce a framework-owned database.

### 3.3 Identical frontend code for public and protected channels

```tsx
useChannel('announcements', {
  on: { published: showAnnouncement },
});

const orderChannel = useChannel('orders.updates', {
  params: { orderId },
  on: { 'status.changed': handleStatusChanged },
});
```

For an empty params schema, `params` may be omitted. Protected access is checked by the server using provider-managed credentials. Do not add `private: true`, a user ID, a role, or a signature to individual hook calls.

The provider may resolve cookies or refreshed application credentials, but credentials do not replace per-channel authorization. One shared connection can carry both public and protected subscriptions. A denied protected subscription does not disconnect unrelated public subscriptions.

### 3.4 Authorization pipeline and lifetime

The server must apply these steps in order:

1. Enforce transport origin, connection, frame-size, and rate limits. Public does not mean unlimited.
2. Resolve only registered and explicitly exposed channel IDs; validate params and canonicalize the partition identity.
3. Resolve current authentication. Anonymous clients may subscribe only to public channels.
4. For a protected channel, invoke its guard with trusted context before revealing events, replay data, presence, or the partition's occupancy.
5. Establish an authorization grant and replay/live subscription. Bind the grant to principal, tenant, channel params, policy epoch, and expiry.
6. Reauthorize on reconnect, replay attachment, credential/tenant changes, and bounded authorization-lease renewal.
7. Process explicit revocation by terminating the affected grants, dropping queued private frames, expiring presence leases, and invalidating client state.

A live subscription is not authorized forever. A proposed maximum authorization-lease age is 60 seconds; explicit revocation should act sooner. Without a distributed revocation source or per-delivery policy check, describe the remaining revocation window honestly. Never continue delivering after a known revocation or an expired grant while waiting for renewal.

Authentication failure maps to `UNAUTHORIZED`; lack of resource permission maps to `FORBIDDEN` or the application's deliberately non-enumerating response. Retry credential refresh at most once per authentication attempt; do not loop indefinitely on permanent denial. Transport fallback must not turn a denied private WebSocket subscription into an allowed SSE subscription.

Replay history also needs an explicit permission policy. For protected channels, default to events covered by the valid grant's history boundary. Resuming with an old cursor requires a still-valid, reauthorized grant/history scope. A new or replaced grant does not automatically authorize previously retained history; enabling broader retained history must be deliberate. When a safe history boundary cannot be established, report a gap and reload authoritative state rather than leak historical events.

### 3.5 Browser security and identity changes

Use HTTPS/WSS, verify the actual upgrade/HTTP origin, and protect cookie-authenticated state-changing control endpoints against CSRF. Do not rely on CORS as authentication. Browser WebSockets cannot be assumed to accept arbitrary authorization headers; use appropriate cookies or a short-lived HTTP-issued ticket sent through a supported, redacted handshake mechanism. Never put long-lived bearer credentials in a URL. [W2]

Logging out, switching users, or switching tenants must increment a client identity epoch. Abort old requests/readers, ignore late responses, purge scoped private query/mutation caches and transcripts, clear private recovery metadata, and reacquire subscriptions using the new identity. Server authorization remains mandatory even when the UI already hides a channel.

Protected is access-controlled, not end-to-end encrypted. The server and its configured providers can process the payload. End-to-end channel encryption is a separate future capability, not implied by TLS or the `authorize` field.

## 4. Presence and current joiner counts

### 4.1 Do not use one ambiguous number

| Value | Meaning |
|---|---|
| `presence.connectionCount` | Active logical client subscriptions to this partition, based on server leases. |
| `presence.memberCount` | Distinct authenticated member identities with at least one active subscription. Available only with member presence. |
| `presence.members` | Bounded safe member records, not raw sessions or tokens. Available only with member presence. |

Pusher also distinguishes subscription counting from identified presence, and deduplicates member add/remove notifications across a user's multiple connections. Relkit should document the distinction equally clearly. [P2] [P3]

Count-only presence is suitable for anonymous public audiences. It cannot truthfully identify distinct people: one anonymous person may have several clients, and several people may share a client. Do not expose a misleading `usersOnline` number for anonymous connections.

### 4.2 Count-only channels

```ts
const announcements = defineChannel({
  id: 'announcements',
  params: z.object({}),
  events: { published: Announcement },
  client: { public: true },
  presence: 'count',
});
```

```tsx
const channel = useChannel('announcements');

return (
  <span>
    {channel.presence.connectionCount === undefined
      ? 'Connecting…'
      : `${channel.presence.connectionCount} connected`}
    {channel.presence.status === 'stale' ? ' (last known)' : ''}
  </span>
);
```

Until an authorized initial snapshot arrives, the count is `undefined`, not zero. After a disconnection, retain the last value with `status: 'stale'`. Do not infer that everyone left merely because this browser went offline.

Presence omission means disabled: no global tracking work and no generated presence methods. Count-only presence exposes no member IDs, member names, or member-specific join/leave callbacks.

### 4.3 Member presence on protected channels

```ts
const viewers = defineChannel({
  id: 'orders.viewers',
  params: z.object({ orderId: z.string() }),
  events: {},
  client: { authorize: canReadOrder },

  presence: {
    member: z.object({
      displayName: z.string(),
    }),
    resolve: resolveViewerInfo,
  },
});
```

`resolveViewerInfo` is a server-side function descriptor accepting the channel params and returning the declared safe info shape. The framework derives a stable, scope-bound member ID from the authenticated principal; the browser never claims its own identity. A member record is `{ id, info }`, where `info` is inferred from `presence.member`.

Do not automatically forward the entire auth session/user record. The member schema is an explicit disclosure contract. Require protected access for identified member lists in the initial release. Public channels may expose counts, not authenticated user directories.

```tsx
const viewers = useChannel('orders.viewers', {
  params: { orderId },
  onPresence: {
    join: (member) => console.log(member.info.displayName),
    leave: (member) => console.log(member.id),
  },
});

const { memberCount, connectionCount, members, status } = viewers.presence;
```

Presence-only channels may declare `events: {}`. Initial population and recovery snapshots replace the member set without firing a synthetic `join` callback for every historical member. Join/leave callbacks describe actual transitions after the snapshot, not a reconstruction animation.

### 4.4 Backend access

```ts
const presence = await updates.getPresence({ orderId });
console.log(presence.connectionCount);
```

This is an invocation-scoped backend capability, not an automatically exposed public HTTP operation. The descriptor method exists only when presence is declared. A frontend presence/count endpoint must enforce the same channel authorization as subscription, even when it returns only a number.

The result must include freshness and provider scope. A local provider reports process-local state; a shared provider reports shared state. Never present a process-local count as an application-global number in a multi-instance deployment.

### 4.5 Counting rules and limits

Two components using the same channel/params under one provider share one subscription. One authenticated user with three independent tabs usually contributes three connections but one member. The observing client is included in its own counts.

Transport reconnection within one client runtime replaces the old subscription lease using fencing/generation tokens. WS-to-SSE overlap must not permanently double count. A full refresh creates a new runtime; the old lease may remain until close detection/expiry, causing a brief connection-count overestimate. Identified member count remains deduplicated across the user's leases.

No system can instantly distinguish every crashed or partitioned client from a live one. Use heartbeats and expiring leases. Proposed starting values: 15-second heartbeat, 45-second lease, and a coalesced count broadcast up to once per second. These are tunable Relkit defaults, not Pusher limits or instantaneous-accuracy guarantees.

Use a provider operation that atomically updates a subscription lease and per-member reference count. First active lease emits member join; last active lease expiry/removal emits member leave. Scope keys by app, environment, tenant, channel, and canonical params. Do not derive counts by adding together uncoordinated per-node counters.

A stalled server-to-browser path must eventually expire the browser's lease. For managed SSE, use authenticated client renewal/acknowledgement over the control channel; server-side heartbeat writes alone do not prove that the browser is receiving. Native EventSource consumers need an explicit lease/renewal contract or a documented weaker connection-only presence mode.

Bound the number and size of presence members, rate-limit changes, and coalesce updates. For initial member-list support, use an explicit member cap; reject excess member admissions with `PRESENCE_CAPACITY_EXCEEDED`, rather than sending a silently truncated list that pretends to be complete. Large public audiences should use counts. A future paginated member API must expose total count separately from the loaded page size.

Presence is ephemeral. After a provider restart or expired cursor, obtain a fresh presence snapshot; do not replay old membership events as current online state. Emit a presence revision/epoch so a delayed old snapshot cannot overwrite a newer one.

## 5. RelkitClientProvider and React ownership

### 5.1 One provider for the normal application

```tsx
// app/providers.tsx
'use client';

import type { ReactNode } from 'react';
import { RelkitClientProvider } from '@relkit/client/react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <RelkitClientProvider
      baseUrl={process.env.NEXT_PUBLIC_RELKIT_URL}
      credentials="include"
    >
      {children}
    </RelkitClientProvider>
  );
}
```

An omitted URL means the configured same-origin backend path, not a guessed server address. Cross-origin cookie usage requires a verified allowed origin and matching cookie configuration.

The provider owns the typed RPC client, oRPC TanStack utilities, QueryClient context, realtime coordinator, subscription registry, agent/thread stores, identity scope, and cleanup. It must not create sockets or run agents during React render. Network resources are acquired after commit and released by reference count.

Applications with an existing TanStack QueryClient may pass it explicitly:

```tsx
<RelkitClientProvider queryClient={queryClient}>
  {children}
</RelkitClientProvider>
```

Document which client is used; do not accidentally create two independent caches. Do not require developers to nest another QueryClientProvider for the standard setup. An external shared QueryClient must be cleaned only within Relkit's affected namespace on logout, without removing unrelated application caches.

The root Next.js layout remains a Server Component and renders the client provider around its children. For SSR/prefetch, create request-scoped server clients and query caches; never share authenticated server caches across requests. Client connections remain lazy until browser commit. [N1]

### 5.2 Hook surface

| Hook | Return / behavior |
|---|---|
| `useRoute(selector, options)` | Real TanStack query result for query-capable routes. |
| `useRouteMutation(selector, options)` | Real TanStack mutation result; execution only through mutate/mutateAsync. |
| `useInfiniteRoute(selector, options)` | Real TanStack infinite-query result. |
| `useSuspenseRoute(selector, options)` | Real TanStack suspense-query result. |
| `useRouteUtils()` | URL-indexed oRPC utilities for options, keys, prefetch, and invalidation. |
| `useRelkitClient()` | Existing low-level typed RPC client for imperative access. |
| `useRealtime()` | Connection state and imperative typed subscribe/bind. |
| `useChannel(name, options)` | Shared channel subscription state, handlers, and optional presence. |
| `useAgent(name, options)` | Typed agent/thread state and explicit execution/control methods. |
| `useStream(selector, options)` | Explicit, request-bound generic stream consumption. |

Do not add a hook for every transport. SSE and WS are implementation choices beneath the resource API.

## 6. URL-typed routes backed by oRPC and TanStack Query

### 6.1 Default read API

```tsx
const {
  data: order,
  error,
  isPending,
  isFetching,
  isError,
  refetch,
} = useRoute('GET /orders/:orderId', {
  input: { orderId },
  staleTime: 30_000,
  enabled: orderId.length > 0,
});
```

`order`, declared errors, input, and `select` output are inferred. The hook returns TanStack's result without renaming `isPending` to a framework-specific flag or replacing `refetch` with another method.

The selector includes the HTTP method because GET and PATCH may share a path. It uses the compiler's normalized path template, not a concrete URL such as `/orders/123`, a query string, or the current browser page URL. Do not infer schema types from arbitrary runtime strings.

`input` is the existing procedure's validated application input—the same shape used by Relkit's typed client. It is not a second handwritten `{ params, query, body }` transport model. The generated runtime map resolves the selector to an exposed procedure ID; oRPC remains responsible for RPC encoding. Native HTTP request mappings continue serving native HTTP callers independently.

Include only routes with actual callable client contracts. Raw Hono handlers without declared contracts must not appear as fictitiously typed JSON procedures. Also exclude server-internal functions and hidden runtime endpoints.

### 6.2 Queries and mutations need distinct hooks

```tsx
const update = useRouteMutation('PATCH /orders/:orderId', {
  retry: false,
  onSuccess: (updatedOrder) => {
    console.log(updatedOrder.status);
  },
});

// Event handler, not render:
await update.mutateAsync({ orderId, status: 'shipped' });
```

The result includes TanStack `mutate`, `mutateAsync`, `reset`, `data`, `error`, `variables`, `isPending`, and the other native result fields. Mutation variables are passed at execution time, not bound to an automatically executing read hook.

Recommendation: keep `useRoute` for reads and `useRouteMutation` for writes. A runtime branch inside a universal hook that calls `useQuery` for one string and `useMutation` for another is not an acceptable implementation. React requires a stable hook call order. Calling every hook unconditionally to imitate a universal result would add idle observers and confusing semantics; it is not the chosen design. [F1]

GET routes with ordinary finite output default to query-capable. Non-GET routes default to mutations. Support an explicit serialized route option `client: { operation: 'query' }` for deliberately read-only POST/search procedures. This is scheduling metadata, not an authorization or idempotency guarantee. Streaming routes are not automatically classified as cached finite queries.

Use separate, conventional hook functions for infinite/suspense variants. Avoid returned dynamic hook factories or hook methods whose names evade the Rules-of-Hooks linter.

### 6.3 Invalidation without generated imports

```tsx
import { useQueryClient } from '@tanstack/react-query';
import {
  useChannel,
  useRoute,
  useRouteMutation,
  useRouteUtils,
} from '@relkit/client/react';

const queryClient = useQueryClient();
const routes = useRouteUtils();

const order = useRoute('GET /orders/:orderId', {
  input: { orderId },
});

const invalidateOrder = () => queryClient.invalidateQueries({
  queryKey: routes['GET /orders/:orderId'].queryKey({
    input: { orderId },
  }),
});

useChannel('orders.updates', {
  params: { orderId },
  on: { 'status.changed': () => { void invalidateOrder(); } },
  onGap: () => { void invalidateOrder(); },
});

const update = useRouteMutation('PATCH /orders/:orderId', {
  onSuccess: () => invalidateOrder(),
});
```

This is a component-body excerpt; call all hooks unconditionally. For strict initial/reconnect consistency, the subscription must also trigger a read after its caught-up/live transition, so an event missed before initial subscription cannot leave an earlier snapshot stale. The full example includes this transition invalidation, event revision checks, and tests for a request already in flight.

Use oRPC's generated keys consistently for fetching, prefetching, optimistic updates, and invalidation. Relkit adds a scoped prefix based on app/backend identity, auth/tenant scope, contract compatibility, procedure identity, and operation kind. Include input through the same serializer/key builder everywhere. Never put a bearer token in a cache key. [O1]

Two route aliases that map to the same exposed procedure may share a key only when their policies and effective semantics match. Distinct routes calling the same function do not automatically share a cache entry.

### 6.4 Infinite and selected queries

```tsx
const orders = useInfiniteRoute('GET /orders', {
  input: (cursor: string | undefined) => ({ cursor, limit: 20 }),
  initialPageParam: undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});

const status = useRoute('GET /orders/:orderId', {
  input: { orderId },
  select: (order) => order.status,
});
// status.data is the selected status type, not the original object.
```

Preserve native pageParam, selected-data, initialData, placeholderData, skipToken, error, and suspense inference. Use the exact utility names in the pinned oRPC version. Keep query key/function creation framework-owned in the convenient hooks; advanced custom transports/functions use normal TanStack + oRPC utilities explicitly.

For read-only streaming observations, the utils may expose oRPC's streamed/live options. Bound retained chunks and define refetch semantics. Never wrap a side-effectful agent run in an auto-refetching query, and never use infinite retry to silently rerun a mutation. [O1]

### 6.5 Cancellation, offline behavior, and identity isolation

Pass TanStack's AbortSignal into the oRPC call. An aborted read cancels the request-bound invocation and releases its scope. Retrying a query must obey the route's read contract.

TanStack's `online` network mode can pause queries and mutations and resume them when connectivity returns. Relkit must not accidentally turn that behavior into an undocumented delayed-write queue. [T1]

Proposed defaults:

- Queries keep TanStack's online/refetch semantics, with retries bounded and permanent auth/validation errors excluded.
- Mutations default to `retry: false`, execute with an explicit fail-fast/offline policy, and are not silently queued by TanStack. Implement this with a mutation execution guard and the selected network-mode behavior; do not assume checking inside a paused mutationFn is sufficient.
- Optional persisted offline writes are a separate explicit feature requiring a supported idempotency policy, storage scope, and visible queue controls.
- A write whose response is lost after transmission has an unknown outcome. Rejecting the promise does not prove that the server did not commit it. Reconcile by idempotency key/status before reissuing.

Authentication/tenant changes must also reset hook-observer state, not just invalidate query keys. Do not allow `placeholderData`, retained mutation data, or a late promise from the previous identity to display private data for the next user. SSR hydration and browser persistence must validate the same identity scope before restoring data.

## 7. Automatic type registry and browser-safe manifests

The frontend imports only public package entry points:

```tsx
import {
  RelkitClientProvider,
  useRoute,
  useRouteMutation,
  useChannel,
  useAgent,
} from '@relkit/client/react';
```

Internally generate and automatically include:

```text
Route registry:   method + path template → procedure/input/output/errors/kind
Channel registry: channel ID → params/events/presence/client exposure
Agent registry:   agent ID → input/output/chat mapping/tools/controls
Runtime manifest: exposed IDs/endpoints/protocol capabilities/compatibility hash
```

The compiler emits a `.d.ts` augmentation for the client package and a small browser-safe runtime manifest. The scaffold/build linker configures inclusion/resolution. Feature code never imports `.relkit/generated`, backend descriptors, or an application graph.

Retain revision 2's one-time frontend-linking design for separately managed applications. Relkit-created full-stack projects are prelinked; separate repositories consume a pinned contract artifact before typecheck/build. Types cannot be derived from a provider's runtime URL alone. Missing registry generation must produce an actionable diagnostic and no useful `string`-wide fallback or `any`.

Generate from the resolved graph so URL selectors match actual normalized route aliases and HTTP methods. Preserve existing flat RPC procedure IDs for backwards compatibility. Changing a public URL deliberately changes the URL-selector surface; stable procedure IDs remain available through the lower-level client.

Do not serialize server closures, authorization implementations, internal channel/agent catalogs, provider keys, model credentials, system prompts, or private schemas into the client manifest. An exposed private channel's name/schema may be a public contract, but not its data or authorization logic.

Support one default app registry per frontend compilation initially. Multiple backends require an explicit scoped client/registry API so identical paths from different apps do not collide. Do not globally merge unrelated registries under the same route string and assume the provider chooses the correct static type.

Negative type fixtures must reject unknown routes, wrong methods, concrete URLs, unknown agents/channels/events, wrong params/payloads, protected internal-only resources, presence access on non-presence channels, member access on count-only channels, and calling a mutation through `useRoute`.

## 8. Shared streaming architecture retained from earlier revisions

```text
Descriptors → checked graph + contracts → common invocation engine
                                      ↓
                            managed stream/run/channel
                                      ↓
             oRPC Fetch / oRPC WS / Hono native / AG-UI / AI UI adapter
                                      ↓
                       shared client stores and typed hooks
```

`defineFunction({ output: streamOf(ItemSchema), handler: async function* ... })` remains the transport-independent generic stream contract. The invocation scope, context, auth, tracing, limits, and resources live until consumption completes/cancels/fails—not only until a handler returns an iterator.

Validate each item, propagate cancellation to nested invocations, bound queues, isolate consumer errors, and invoke iterator cleanup exactly once. Engine cleanup must also cover handler failure before the first item, consumer break, client disconnect, and server shutdown.

Routes may expose native `sse`, `text`, or `bytes` formats through Hono's helpers. Typed clients use the oRPC iterator protocol. An AG-UI endpoint uses an AG-UI encoder; an AI SDK endpoint uses that protocol's encoder. These formats may all use SSE but must not share the wrong parser or completion conventions. [O2] [H1] [A1]

After HTTP headers are committed, emit the applicable safe protocol error/terminal event if possible; do not attempt to return a new JSON status body. Do not buffer a streaming Response through `.text()` or `.json()` when proxying. Configure heartbeat, ingress idle limits, buffering, compression, and deployment lifetimes using real wire tests, not only unit tests. [H1]

`useStream('GET /reports/:reportId/progress', options)` is the explicit generic stream helper. Query-safe observations can use streamed/live query utilities; non-idempotent execution starts only through an explicit start/action. Agent runs use their own server-owned run lifecycle rather than a generic request-bound iterator.

## 9. Pi agent-core review and required additions

The review covered Pi's agent README, types, and loop implementation at the pinned commit—not an older description of the project and not the whole coding-agent application. Pi separates application messages from model messages, provides lifecycle and tool execution events, supports steering/follow-up queues, and distinguishes the event order of concurrent tool completion from the order of model transcript results. [PI1] [PI2] [PI3]

| Observed in Pi | Relkit action | Acceptance requirement |
|---|---|---|
| Agent, turn, and message lifecycle | Make run, step, message, and final-result state distinct. | An empty output, tool-only message, failed turn, and completed run all render correctly. |
| Incremental assistant events | Preserve text/part identity and deltas; do not resend full growing snapshots per token. | Interleaved parts have stable IDs and bounded reducer work. |
| Tool argument streaming | Show incomplete tool arguments as drafts, not executable validated input. | Split JSON tokens and truncated arguments never trigger execution. |
| Tool execution updates | Add typed, bounded progress for function-backed tools. | Progress appears before completion without becoming the final output. |
| Parallel and sequential tools | Separate scheduling policy, completion order, and transcript order. | Out-of-order completion does not attach results to the wrong tool or reorder model artifacts. |
| Before/after tool policy | Retain Relkit validation, authorization, approval, result validation, and audit in the common engine. | Approval occurs after validated arguments and before the actual side effect. |
| Steering | Add `steer` at safe turn boundaries. | A steering message does not falsely imply that a running tool was cancelled. |
| Follow-up queue | Add explicit, bounded `followUp`. | Accepted work survives observer reconnect; no implicit send queue. |
| Graceful stopping | Distinguish immediate cancellation request from stop-after-turn. | Current side effects are not reported as rolled back. |
| Context transform and model-message conversion | Keep UI-only state/tool details out of model context; add a budget/pruning seam. | UI state and model prompt are independently validated/redacted. |
| Images and structured tool results | Preserve attachments and structured outputs in the transcript model. | Validate type/size/authorization and do not treat arbitrary URLs as trusted files. |
| Dynamic model/credential resolution | Resolve provider credentials at execution boundaries. | No browser credential exposure; expired credentials fail safely. |
| Awaited Agent-class event subscribers | Distinguish durable engine barriers from browser observers. | Journal/approval barriers are awaited; a slow browser cannot indefinitely block a model/tool loop. |
| Explicit error/aborted outcomes | Preserve partial output and clear terminal status. | EOF without terminal confirmation is not interpreted as successful completion. |

Pi's current loop does not skip the already issued tool batch when a steering message arrives; it consumes steering at the defined boundary. Relkit must not document steering as an instantaneous interrupt. Pi's loop also refuses to execute tool calls from a token-truncated assistant message; adopt an equivalent safety test, not merely JSON-fragment concatenation. [PI2] [PI3]

### 9.1 Tool progress in Relkit

Add an optional `progress` schema to a function descriptor. A progress-enabled function receives a typed `context.progress.emit(value)` capability; its `.asTool()` view inherits that schema. The function's declared `output` still validates the final result.

Progress emission enters the invocation journal/observer seam and is mapped to an AG-UI activity snapshot/delta associated with `toolCallId`. Await only bounded acceptance by the framework, not every browser handler. Disallow emission after the function settles. Coalesce replaceable progress snapshots under pressure; do not drop authoritative final results or approvals.

Keep function-backed tools handler-free as tools. Do not introduce a second standalone tool execution API solely to resemble Pi's `execute` interface.

### 9.2 Scope boundaries

No mandatory Pi dependency, no browser-side unrestricted tool execution, and no implicit replacement of AI SDK or Effect internals. Advanced model swapping, speculative execution, arbitrary runtime tool discovery, branch/time-travel UI, and frontend-executed tools are not required for the first release. The protocol should represent supported capabilities without pretending that the Relkit runtime implements every upstream feature.

## 10. Agent streaming protocol and interoperability

### 10.1 Selected protocol

Use AG-UI as the canonical public agent-event vocabulary and provide a genuine, version-pinned AG-UI interoperability endpoint. It is an open agent-to-frontend protocol; it is not a universal requirement followed by every agent library. AI SDK UI Message Stream is another documented protocol and merits an optional adapter because Relkit already uses AI SDK. Pi's `AgentEvent` is a runtime API, not a replacement for a cross-framework wire contract. [G1] [A1] [PI1]

MCP remains the tool/data boundary, and A2A addresses agent-to-agent communication; neither is the selected browser chat-event format. Do not confuse protocol compatibility with adopting a hosted product. [G1]

Separate four layers:

1. Relkit engine events and execution controls.
2. Validated AG-UI semantic events and a versioned Relkit extension profile.
3. A retained journal envelope carrying cursor, scope, and event identity.
4. Transport encoders: oRPC iterators, native AG-UI SSE, optional AI SDK UI SSE.

The native AG-UI response must contain actual AG-UI event objects, not a custom `{ data: { event: ... } }` wrapper advertised as compatible. The cursor may be carried in the SSE ID field and SDK metadata. The oRPC SDK adapter unwraps its transport metadata before feeding a standard reducer/adapter.

### 10.2 Event mapping

| Meaning | AG-UI representation |
|---|---|
| Execution segment begins | `RUN_STARTED` with thread/run IDs. |
| Turn/step boundary | `STEP_STARTED` / `STEP_FINISHED` with a stable step name. |
| Assistant text | `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`. |
| Model specifies tool and arguments | `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`. |
| Actual tool execution result | `TOOL_CALL_RESULT`, with the correlated tool-call ID and a protocol-valid content encoding. |
| Tool execution state/progress | `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA`, with a documented Relkit activity type and tool-call correlation. |
| Restorable UI state/history | `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`. |
| Validated final application output | `RUN_FINISHED.result` after validation, plus supported usage metadata. |
| Approval / required input | Interrupt-aware `RUN_FINISHED.outcome`, followed by standard resume input in a new run. |
| Fatal failure | `RUN_ERROR` with sanitized code/message. |
| Explicit cancellation | `RUN_ERROR` with the documented `RELKIT_CANCELLED` code in this profile; render as cancelled, not a generic failure. |
| Relkit-specific queue acknowledgements | Namespaced `CUSTOM` events or reserved application metadata, with generated schemas. |

`TOOL_CALL_END` means the argument specification is complete. It does not mean that a payment/refund/file write has succeeded. Actual execution progress and result are separate. [G2]

AG-UI's tool result content is a string in the inspected schema. Encode structured output according to the profile (for example JSON text), validate it on the Relkit side, and expose the typed application result in the Relkit reducer. Do not silently place an arbitrary object where the standard requires a string. [G4]

Standard fields such as protocol metadata must remain schema-valid. Use a documented `relkit` namespace for application-specific metadata and an explicit extension version. Do not misuse the reserved `ag-ui` namespace. Unknown optional extensions should be safely ignored by generic clients; missing required capabilities must fail negotiation. [G3]

### 10.3 Interrupt and approval lifecycle — a correction to revision 2

The current AG-UI interrupt model ends an execution segment with an interrupt outcome. Resuming supplies responses for the open interrupts in a new run on the same thread. Transport reconnect is different: it observes the same still-active run. [G6]

```text
thread-1
  run-1: tool arguments → persisted approval boundary → RUN_FINISHED(interrupt)
  run-2: validated resume decisions → authorized tool execution → result → finish

Browser disconnect during run-2:
  reconnect to observe run-2; do not create run-3 or repeat the prompt.
```

Use separate identifiers for thread, logical user operation, execution-segment run, tool call, and interrupt. A stable logical operation may span multiple run IDs. Do not use `parentRunId` as an invented resume requirement; use the standard interrupt references and preserve any parent/branch semantics defined by the pinned profile.

Before emitting an interrupt terminal event, persist the pending validated tool plan and required continuation state, and emit the safe snapshots needed by clients. Credentials, hidden prompts, and sensitive internal context remain server-side. A UI snapshot is not an authorization capability and must never be trusted as the server execution plan.

The inspected protocol requires a resume to cover every open interrupt from that segment. `approve(id)` and `deny(id)` can record decisions individually, but the manager must wait until all required decisions are collected and then submit one idempotent resume set. Include `respondToInterrupts` for applications needing an explicit batch. Do not resume a parallel approval batch one tool at a time while claiming standard compatibility. [G6]

Approval persistence must bind the decision to principal, thread, interrupt, tool-call ID, validated argument hash, schema/policy version, and expiry. Recheck authorization before execution. Same decision is idempotent; conflicting/stale/foreign decisions are rejected. Denial is an explicit response such as `{ approved: false }`, not transport disconnection or an approval timeout that defaults to yes.

Do not expose a fake `RUN_PAUSED` enum or an undocumented successful terminal frame for pending approvals. If the selected published protocol package lacks the required interrupt profile, treat that as a compatibility gate: upgrade/pin a verified compatible release or label and test a distinct legacy profile. Never silently claim equivalent semantics.

### 10.4 AI SDK UI Message Stream adapter

Provide a separate optional adapter for applications already using AI SDK's UI components. It emits that protocol's documented chunks, response header, and `[DONE]` marker. It is not the same framing as an oRPC event iterator or the AG-UI stream. [A1]

Map text parts, complete/partial tool input, tool output/error, approvals, steps, custom data, and terminal status deliberately. Relkit-specific activities may need typed `data-*` parts. Document any lossy mapping; do not flatten multiple tools, messages, or interrupted runs into an indistinguishable text string.

The oRPC AI SDK integration documents conversion between iterators and AI streams, warns about proxied event values with `structuredClone`, and leaves reconnect logic to the application adapter. Reuse the installed unproxy/stream conversion helpers where compatible, but implement Relkit's run reattachment rather than copying an unsupported reconnect placeholder. [O3]

Compatibility requires an actual external AG-UI client and an actual AI SDK UI parser in tests—not only a Relkit client consuming a Relkit server. Keep optional adapters tree-shakeable and avoid pulling React or both UI SDK stacks into backend authoring packages.

### 10.5 Payload safety and protocol evolution

Expose only allowlisted user-facing output, safe tool data, and approved summaries. Do not forward provider `rawEvent`, hidden system prompts, encrypted reasoning blobs, or secret-bearing context by default. Support provider-permitted reasoning summaries as a separately enabled capability, not a promise to reveal hidden model reasoning.

Validate ordered lifecycle rules, stable message/tool IDs, event size, incremental argument limits, maximum result bytes, patch depth/count, and total retained transcript size. JSON Patch application must reject prototype-polluting paths and invalid/out-of-order bases. An unsupported required protocol version is an explicit compatibility failure, not best-effort interpretation.

## 11. Named useAgent API and controls

```tsx
const assistant = useAgent('orders.assistant', {
  threadId,
  input: { orderId },
});

await assistant.send('Where is my order?');

assistant.messages;
assistant.output;
assistant.status;
assistant.connectionStatus;
assistant.approvals;
assistant.usage;
```

The backend still explicitly declares which input field is the chat message and which output field is displayable text. A non-chat agent exposes `run(input)` instead of an untyped string prompt. Controls are generated only for capabilities declared/supported by that agent.

```ts
// Optional capabilities, when enabled for this named agent:
await assistant.steer('Check the shipping address first.');
await assistant.followUp('Then summarize the delivery options.');
await assistant.stop();                    // Immediate cooperative cancellation request.
await assistant.stop({ after: 'turn' });   // Finish the current turn, then stop.
await assistant.approve(approvalId);
await assistant.deny(approvalId);
```

`send` starts new work only when legal for the thread; an active run returns a clear busy result unless an explicit supported queue action is used. `steer` is accepted into a bounded server-owned queue and applied at the next safe boundary, not injected into an already issued tool call. `followUp` is processed when current natural work would finish. These are explicit user actions, not an automatic offline write queue.

Accepted control messages need idempotency IDs, state (`accepted`, `applied`, `rejected`, `cancelled`), and ownership checks. On a run-end/control-acceptance race, the server must either claim the message atomically or reject it visibly. Never acknowledge a command that will be silently discarded.

The hook does not automatically create a thread, run the model, execute a tool, or retry a side effect when mounted. A new conversation uses an explicit typed `createThread` action; its ID is placed in the app URL or another durable application identity so refresh can reload it.

Tool parts must distinguish `input-streaming`, `input-ready`, `approval-required`, `running`, `succeeded`, `failed`, and `denied`. Partial tool input is not statically a complete validated input. Only the validated states may expose the full inferred input type. The result type is discriminated by the allowed tool name; hidden or dynamically unknown tools must not be presented as falsely precise types.

Application thread ownership, public-agent access, controls, and attachments require their own explicit policies. Knowing `orders.assistant`, a thread ID, or a run ID grants no authority. Rate and cost limits also apply to publicly exposed agents.

## 12. Offline, refresh, and multi-instance recovery

### 12.1 Guarantees by resource

| Situation | Channel / presence | TanStack route | Agent thread/run |
|---|---|---|---|
| Brief disconnection | Reconnect, reauthorize, replay retained channel events; refresh presence snapshot. | Queries can pause/refetch; writes are not silently replayed. | Reattach to the same active run journal. |
| Page refresh | Restore authoritative UI state, then subscribe/resume; a saved cursor alone is insufficient. | Re-query or hydrate a scoped persisted snapshot. | Load thread/history and observe its existing active run. |
| Retention exceeded | Report gap, reread authoritative state, obtain fresh presence. | Re-query. | Load durable transcript/snapshot; report unavailable fine-grained history if necessary. |
| User/tenant change | Drop old grants, leases, private state and cursors. | Isolate/purge scoped caches and late responses. | Detach and clear private transcript/controls before changing identity. |
| API worker loss | Shared log/lease store enables another instance; local-only state resets explicitly. | Read retry subject to contract; uncertain writes require reconciliation. | Restore history; mark lost execution interrupted unless a verified checkpoint exists. |
| Approval continuation | Not a connection event. | Explicit idempotent control request. | Resolve interrupts and start the next segment, without rerunning completed tools. |

### 12.2 Reconnect and replay algorithm

Maintain desired subscriptions separately from physical connections. Use exponential backoff with jitter, one retry owner, bounded retries/timeouts, current authentication, and per-subscription resume positions. A cursor is not a permission and a single last event ID does not describe every channel in a multiplexed connection.

The provider must combine retained replay with an atomic/log-backed live tail. Replay-then-subscribe against an unrelated lossy bus has a race. Deduplicate by event identity, preserve per-partition order, report caught-up, and ignore late callbacks from replaced transport generations.

A newly created EventSource does not inherit the old object's event ID. Native refresh recovery therefore needs an explicit checkpoint mechanism; the managed oRPC/HTTP path can carry recovery data through its own validated control protocol. Neither SSE nor WS supplies durable replay storage for Relkit. [W1] [O2]

### 12.3 Rehydrate before advancing a checkpoint

A React counter reset by refresh cannot recover its previous value merely by resuming after its last processed increment event. Use authoritative fetch + event invalidation for ordinary pages, or a consistent snapshot/cursor pair for event-derived views.

Relkit owns the agent transcript reducer and presence snapshot store, so it can restore those resources. It does not own arbitrary application state changed inside a channel callback. Do not advertise exactly-once callback effects, and do not treat a received callback as a transactional acknowledgement of UI/business state.

On initial subscribe and recovery, an order page should fetch after the subscription reaches its caught-up fence, or use a transactional snapshot-with-cursor API. Events/invalidation during an older in-flight fetch need a final refetch or revision check. A handler throwing must not kill other subscribers or create an infinite poison-event retry loop.

### 12.4 Durable agent boundaries

Run acceptance is an idempotent server operation separate from observation. Store logical operation ID, run/thread IDs, pending tools, approval decisions, final outcomes, and replayable events before acknowledgement according to the provider contract.

Disconnect/unmount detaches the observer. Explicit cancellation requests stop execution cooperatively. A tool that already committed an external change cannot be made not to have happened by aborting an HTTP stream.

A worker crash during an external tool has an unknown-effect window unless that tool provides application-level idempotency or transactional recovery. A saved transcript is not a checkpoint of a JavaScript stack or provider request. On unverified recovery, restore state and mark interruption; never automatically regenerate the prompt and duplicate work.

Use a stable tool-effect key across approval run segments, such as logical-operation ID plus tool-call ID. Including only the new segment's run ID can accidentally remove deduplication at exactly the recovery boundary where it is needed.

### 12.5 Provider capabilities

| Provider tier | Permitted claims |
|---|---|
| In-memory local | Same-process live delivery, bounded local replay, process-local presence; restart loses volatile state. |
| Shared retained log + leases | Cross-node replay/fanout and shared presence within configured retention/availability limits. |
| Durable thread/run store | Thread history, idempotent acceptance, approvals, run journal reattachment. |
| Verified execution checkpoints | Safe continuation from supported boundaries with explicit tool-effect reconciliation. |

Production multi-instance deployment requires shared components for every claimed shared guarantee. Redis Pub/Sub alone is not a replay log. Choose a retained-log provider separately from a live notification mechanism. [D1]

A runtime capability manifest and Inspector status panel must expose the active tier, replay retention/caps, presence scope, and run recovery support. Deployment remains under Relkit's existing Pulumi ownership; do not introduce a second deployment engine.

## 13. Inspector: channels, routes, agents, and tools

The Inspector uses the same protocol reducers and public-like SDK primitives, but through its existing privileged authorization, generation/hash checks, and audit boundary. It must not bypass the engine or make app-private resources public just to display them.

### Required screens

| Screen | Required behavior |
|---|---|
| Channel catalog | Show internal/public/protected badges, schemas, replay tier, presence mode, and safe subscription diagnostics. |
| Channel detail | Trigger with validated input in authorized dev mode; subscribe/bind; show event IDs, replay/live distinction, gaps, connection/member counts, and stale indicators. |
| Route explorer | Show actual method/path selectors, corresponding procedure identity, query/mutation classification, streaming format, and generated hook snippets. |
| Agent catalog | List discoverable agents, inputs/outputs, model selector, tools, limits, supported controls, protocol profile, and chat capability. |
| Agent chat | Restore thread; stream parts; show step/activity/tool timeline; stop/steer/follow-up; reconnect without starting another run. |
| Approval panel | Safe arguments, side-effect warning, expiry, per-interrupt decision collection, and batch continuation status. |
| Run diagnostics | Logical operation and segment run IDs, protocol events, accepted/applied queue controls, usage, replay scope, terminal/interrupted status. |

Raw events, tool arguments/results, provider errors, attachments, and transcript storage require redaction/size limits. Do not display raw reasoning or secret-bearing provider payloads by default. Read-only mode and disabled production endpoints remain enforced.

### Demonstration journey

The checked example must demonstrate two browsers (anonymous and signed-in), one public channel, one protected order channel, forbidden subscription, a changing connection count, one user in two tabs, member deduplication, an agent issuing a progress-reporting tool, an approval interrupt, a queued follow-up, refresh during execution, reconnect replay, deliberate log expiry, and a worker interruption. Keep mock model/provider fixtures deterministic and avoid real paid model calls in routine CI.

## 14. Documentation plan — implementation work, not a final checklist item

Relkit's current root docs navigation has HTTP, AI, and operations sections. HTTP already includes `generated-clients`. Extend that information architecture rather than placing all of this in an isolated design memo. [R7] [R8]

### 14.1 Navigation

Add `client` and `realtime` after `http` in `apps/docs/content/docs/meta.json`. Keep backend durable events/pub-sub in `events`; explicitly cross-link it to browser realtime without equating the two delivery models.

```text
Start
HTTP Routes
  Generated clients                   (updated)
  Streaming responses                 (new)
Client                                (new root section)
  Overview and setup
  RelkitClientProvider
  useRoute
  Mutations and optimistic updates
  Infinite and suspense queries
  Type generation and frontend linking
  Next.js and SSR
  Authentication and cache isolation
  Offline behavior and troubleshooting
Realtime                              (new root section)
  Overview / first channel
  Public and protected channels
  Trigger, subscribe, and bind
  useChannel and useRealtime
  Counts and presence
  Replay, refresh, and gaps
  Providers and deployment
AI                                    (expanded)
  Agent streaming and useAgent
  Tools, progress, and approvals
  Steering and follow-up
  Threads and recovery
  Streaming protocol compatibility
Operations                            (expanded)
  Inspector realtime and agent chat
  Streaming observability and limits
  Long-lived connection deployment
```

### 14.2 Exact documentation deliverables

Paths below are relative to `apps/docs/content/docs/`; **new** files must be created, while existing related pages should be updated rather than duplicated.

| File | Required content | Executable proof |
|---|---|---|
| `client/index.mdx` **new** | One provider + first typed route + no generated imports. | Fresh Next/Vite example compiles. |
| `client/provider.mdx` **new** | Owned/external QueryClient, credentials, lazy lifecycle, identity changes. | Existing QueryClient integration test. |
| `client/use-route.mdx` **new** | Method/path selectors, canonical input, native TanStack result/options, raw-route limits. | Query/select/disabled/error fixtures. |
| `client/mutations.mdx` **new** | mutateAsync, invalidation, optimistic rollback, unknown outcomes, no hidden queue. | Mutation + lost acknowledgement test. |
| `client/infinite-and-suspense.mdx` **new** | Page inference, QueryClient utilities, suspense boundaries, no conditional hooks. | Infinite/select/suspense type tests. |
| `client/type-generation.mdx` **new** | Automatic linking, separate repos, CI generation, stale contracts, multi-app limitation. | Clean checkout generates before typecheck. |
| `client/nextjs.mdx` **new** | Client provider/root layout, server prefetch/hydration, per-request cache, streaming proxy limits. | Next production build + SSR isolation. |
| `client/authentication.mdx` **new** | Cookie/token setup, query isolation, refresh/logout/tenant switch, CSRF boundaries. | Identity-switch leak tests. |
| `client/offline.mdx` **new** | Query reconnect vs mutation execution; stored data scope; troubleshooting. | Browser offline tests. |
| `realtime/index.mdx` **new** | First public channel, backend trigger, useChannel in a complete app. | Scaffolded walkthrough. |
| `realtime/access.mdx` **new** | Internal/public/protected union, trusted guard, history/presence access, revocation. | Anonymous/allowed/forbidden fixtures. |
| `realtime/events.mdx` **new** | trigger receipts, subscribe/bind/unbind, schemas, handler cleanup, outbox caveat. | Zero-subscriber and duplicate-handler tests. |
| `realtime/react.mdx` **new** | Declarative handlers, stable callbacks, status, onGap, refcounting. | StrictMode and two-component tests. |
| `realtime/presence.mdx` **new** | Connection vs member count, safe profiles, tabs, stale state, lease expiry, limits. | Multi-tab and dead-client tests. |
| `realtime/recovery.mdx` **new** | Per-channel cursors, replay/live handoff, snapshot restoration, gaps, refresh. | Replay-fence and cursor-expiry tests. |
| `realtime/providers.mdx` **new** | Local/shared capability tiers, retained logs vs Pub/Sub, limits, deployment. | Multi-node provider tests. |
| `http/streaming.mdx` **new** | streamOf, native SSE/text/bytes vs typed oRPC, cancellation and post-header errors. | Real streaming wire tests. |
| `http/generated-clients.mdx` **update** | Default hook journey; low-level client remains; no feature-file generated imports. | Snippet generation/typecheck. |
| `ai/streaming.mdx` **new or merge with existing equivalent** | Named useAgent, chat mapping, typed parts, final output. | Mock multi-step chat example. |
| `ai/tool-progress-and-approvals.mdx` **new** | Draft arguments, validated execution, progress, parallel tools, interrupt decisions. | Truncated JSON + duplicate approval tests. |
| `ai/steering-and-follow-up.mdx` **new** | Safe boundaries, explicit queues, busy errors, stop-after-turn. | Run-end race and queue tests. |
| `ai/threads-and-recovery.mdx` **new** | Thread identity, same-run reattach, new-run approval continuation, interruption limits. | Refresh + approval + worker loss. |
| `ai/protocols.mdx` **new** | Exact AG-UI profile/versions, extensions, AI SDK adapter, framing, capability matrix. | External-client interoperability tests. |
| `operations/inspector-realtime.mdx` **new** | Channel access/count diagnostics and protocol inspection. | Inspector browser journey. |
| `operations/inspector-agents.mdx` **new** | Chat/tools/approvals/controls with generation/auth auditing. | Inspector chat recovery journey. |
| `operations/streaming.mdx` **new** | Proxy timeouts, heartbeats, shutdown, memory, observability, provider tier. | Deployment smoke tests. |

Create/update `meta.json` for each section, root navigation, generated API docs, related-page metadata, search indexing, and CLI option tables. Update `start/create-an-app`, first-route/client examples, AI starter, and local-development/Inspector guides to point to the new workflow. Preserve existing URLs where practical and use redirects for renamed pages.

### 14.3 Tutorial sequence

The default learning path is: create app → define public channel → mount provider → call typed route → trigger backend event → useChannel → protect it → show counts → add agent/tools → chat → reconnect/refresh → deploy with declared guarantees.

Do not introduce raw WebSocket constructors, custom SSE parsers, AG-UI envelopes, or generated TypeScript imports in the first tutorial. Those belong in adapter/protocol reference pages.

Every tutorial must label application helpers, provide all necessary files, state whether a mock or real model/provider is used, state required environment values, and show the expected observable result. Avoid examples that rely on an undocumented database/auth plugin or a paid model call just to verify setup.

### 14.4 Documentation acceptance

Every public export and descriptor option has a reference entry with inference, defaults, errors, security notes, and supported runtime/provider capabilities. Every example is sourced from an executable example or typechecked fixture rather than independently copied prose code.

Run existing `test:docs` checks, link checks, generated-reference checks, and search checks. Add typechecking for code snippets and framework import boundaries. Draft feature pages must not appear as shipped public functionality before the release flag/version supports them. Include a migration page from both earlier proposed APIs where useful, but make only this revision's API the primary guidance.

## 15. Packages, files, and responsibilities

Paths reflect the existing repository organization. New filenames are proposed; confirm neighboring conventions before implementation. Do not create duplicate services where an existing internal module owns the same responsibility.

| Package / file | Change | Input → output / responsibility |
|---|---|---|
| `packages/realtime/src/define-channel.ts` | **new** | Params/event schemas + access/presence → immutable descriptor. |
| `packages/realtime/src/access.ts` | **new** | Trusted principal + params → authorized scoped grant; revocation/renewal. |
| `packages/realtime/src/presence.ts` | **new** | Fenced leases → counts/member snapshots/changes. |
| `packages/realtime/src/provider.ts` | **new** | Append/tail, replay, lease, and capability interfaces. |
| `packages/realtime/src/trigger.ts` | **new** | Validated event → invocation-scoped provider receipt/telemetry. |
| `packages/services/src/define-service.ts`, related types/guards | extend | Identity-preserving channel/agent members and collision validation. |
| `packages/functions/src/*types*`, descriptor factory, context assembly | extend | Stream/progress contracts and context capabilities without changing unary behavior. |
| `packages/app/src/*` and package exports | extend | Public `realtime` / streaming APIs; keep internals unsupported. |
| `packages/compiler/src/route-client-metadata.ts` | **new** | Resolved HTTP triggers → normalized URL selector map and operation class. |
| `packages/compiler` descriptor discovery/validation | extend | Explicit exposure/access/presence capabilities in checked graph. |
| `packages/graph` / `packages/contracts` | extend | Versioned route/channel/agent/protocol metadata and diagnostics. |
| `packages/engine` / `packages/runtime-effect` | extend | Managed iterator/progress lifetime, cancellation, finalization, errors. |
| `packages/runtime-hono/src/rpc.ts` | extend | Shared procedure materialization with streaming and existing middleware/policy. |
| `packages/runtime-hono/src/realtime.ts` | **new** | Authorized shared WS and HTTP observation/control adapters. |
| `packages/runtime-hono/src/agent-runs.ts` | **new** | Exposed thread/run/control operations through engine-owned execution. |
| `packages/runtime-hono/src/agent-protocols.ts` | **new** | Native AG-UI endpoint and optional AI UI adapter; negotiated framing. |
| `packages/client-generator/src/generate-contract.ts` | extend | Existing contracts plus stream/client metadata, preserve RPC compatibility. |
| `packages/client-generator/src/generate-registry.ts` | **new** | Browser-safe typed route/channel/agent maps, automatically included declarations. |
| `packages/client-generator/src/generate-client-manifest.ts` | **new** | Safe runtime selector/endpoints/capability map and compatibility hash. |
| `packages/client/src/react/provider.tsx` | **new** | Shared client + QueryClient contexts; identity isolation and lifecycle. |
| `packages/client/src/react/use-route.ts` | **new** | URL selector + query opts → native UseQueryResult through oRPC utils. |
| `packages/client/src/react/use-route-mutation.ts` | **new** | URL selector + mutation opts → native mutation result with explicit offline policy. |
| `packages/client/src/react/use-infinite-route.ts` / `use-suspense-route.ts` | **new** | Native TanStack variants with generated inference. |
| `packages/client/src/react/use-route-utils.ts` | **new** | Scoped URL-keyed oRPC utilities. |
| `packages/client/src/react/use-channel.ts`, `use-realtime.ts` | **new** | Stable subscriptions/bindings, presence state, recovery notifications. |
| `packages/client/src/react/use-agent.ts`, `use-stream.ts` | **new** | Typed named state/actions; no implicit side-effectful mounts. |
| `packages/client/src/recovery/*` | **new** | Transport owner, checkpoints, identity epochs, gap/state coordination. |
| `packages/client/src/agent-reducer.ts` | **new** | Validated protocol events → typed transcript, tools, approvals, output. |
| `packages/agents/src/runtime-loop.ts`, related tool/runtime modules | extend | Stream lifecycle, bounded progress, tool ordering, safe control boundaries. |
| `packages/agents/src/run-manager.ts`, `thread-store.ts` | **new** | Idempotent acceptance, journal, continuation checkpoints, execution fencing. |
| `packages/agents/src/controls.ts` | **new** | Accepted/applied steering/follow-up/stop/approval state transitions. |
| `packages/agents/src/protocol/*` | **new** | AG-UI mapper/profile validation and optional AI UI mapping. |
| `packages/inspector-api/src/actions.ts`, run/channel endpoint modules | extend | Authorized, generation-scoped read/control actions and audit. |
| `apps/inspector` | extend | Channel/presence explorer, typed route examples, agent chat/tool controls. |
| `packages/cli`, generator, templates | extend | Automatic client linking, channel/stream scaffolding, checks/diagnostics. |
| `apps/docs/content/docs`, generated references | extend | Documentation work in section 14. |
| `examples/commerce` and dedicated React/Next.js example | extend/new | Executable cross-feature journey with mock identities/model/provider. |
| `tests/types`, `tests/integration`, `tests/security`, `tests/inspector`, browser tests | extend | Gates in sections 16–17; follow existing test directory conventions. |

Keep React/TanStack React dependencies isolated to the client React export and its supported peer-dependency policy. Keep Pi optional/non-required. Add protocol and provider dependencies only in the packages that own those boundaries.

### Minimum internal interfaces

```ts
interface ChannelProvider {
  readonly capabilities: {
    readonly replay: 'none' | 'memory' | 'durable';
    readonly presenceScope: 'process' | 'shared';
  };
  // Concrete types are package-internal and versioned.
  append(request: ValidatedChannelEvent): Promise<TriggerReceipt>;
  tail(request: AuthorizedReplayRequest): Promise<ManagedEventReader>;
  acquirePresence(request: AuthorizedPresenceLease): Promise<PresenceSnapshot>;
  renewPresence(request: FencedPresenceRenewal): Promise<void>;
  releasePresence(request: FencedPresenceRelease): Promise<void>;
}

interface AgentRunStore {
  accept(request: AuthorizedIdempotentRunRequest): Promise<AcceptedRun>;
  append(request: ValidatedJournalAppend): Promise<JournalPosition>;
  snapshot(request: AuthorizedThreadRead): Promise<ThreadSnapshot>;
  claimResume(request: AuthorizedInterruptDecisions): Promise<AcceptedRun>;
  claimExecution(request: FencedExecutionClaim): Promise<ExecutionLease>;
}
```

These are implementation seams, not app imports. Each concrete request type must include scope, identity, limits, idempotency/fencing, and validation outcomes; the abbreviated names are not a license to use untyped transport blobs.

## 16. Implementation phases and review gates

### P0 — Compatibility, decisions, and fixtures

**Inputs:** pinned repository and upstream packages, this revision.  
**Work:** record exact versions; prove real oRPC/Hono/WS streaming; verify TanStack utilities and external protocol parsers; freeze descriptor and hook names; establish golden event/type fixtures.  
**Outputs:** compatibility record, fixtures, protocol profile, phase checklist.  
**Gate:** no remaining unverified upstream API assumption is presented as implemented. Existing unary tests remain green.

### P1 — Descriptors, exposure, and graph metadata

**Dependencies:** P0.  
**Work:** add channel policy union, presence/progress capabilities, services membership, route selector/classification, agent control metadata; extend discovery and browser allowlists.  
**Outputs:** immutable descriptors, graph fields, compiler diagnostics.  
**Gate:** malformed/ambiguous access rejected; internal resources absent from client output; selector collisions and raw-contract gaps diagnosed.

### P2 — Automatic client generation

**Dependencies:** P1.  
**Work:** extend registry/manifest generation; configure automatic inclusion/linking; preserve old RPC client IDs; detect stale/missing contracts; browser bundle boundary tests.  
**Outputs:** zero-generated-import fixtures, typed URL/channel/agent registry.  
**Gate:** clean frontend checkout builds from contract artifact; negative type tests fail as expected; no server code or secrets in bundle.

### P3 — Common managed stream and progress engine

**Dependencies:** P0–P1.  
**Work:** long-lived invocation scope, item/progress validation, cancellation, finally cleanup, bounded queues, safe failure mapping.  
**Outputs:** engine stream/progress seams and native/oRPC adapters.  
**Gate:** first item arrives before completion, early break cancels upstream, scopes release exactly once, unary behavior unchanged.

### P4 — Channel trigger, access, and replay provider

**Dependencies:** P1, P3.  
**Work:** trigger validation, ordered append/tail, live/replay fence, authorization grants/history scope, revocation, provider capabilities, memory adapter.  
**Outputs:** backend event trigger + authorized subscription core.  
**Gate:** no private replay leaks, no handoff gaps, no false durable/shared claims, outbox example documents direct-trigger crash window.

### P5 — Presence and WS/SSE delivery

**Dependencies:** P4.  
**Work:** leases, counts/member sets, bounded snapshots, shared-provider seam, WS/HTTP multiplexing, renewal, reconnect/fallback generations, server shutdown.  
**Outputs:** transport-neutral subscriptions with counts/presence.  
**Gate:** unauthorized users cannot observe occupancy; two tabs/one user behave correctly; old transport callbacks ignored; dead client expires; SSE liveness tested over real network.

### P6 — React provider and TanStack route hooks

**Dependencies:** P2, P3.  
**Work:** provider/client/query ownership; URL-typed query/mutation/infinite/suspense hooks and utils; signal propagation; fail-fast write policy; SSR hydration and identity isolation.  
**Outputs:** native TanStack hook results and executable Next.js/Vite examples.  
**Gate:** select/pageParam/error inference; no conditional hooks; no mount mutation; no cross-user cache leak; invalidation and optimistic updates use canonical keys.

### P7 — Realtime hooks and recovery UI

**Dependencies:** P2, P5, P6.  
**Work:** useChannel/useRealtime stores, callback freshness, refcounting, onGap/caught-up coordination, presence state, status/error recovery.  
**Outputs:** simple typed subscription experience.  
**Gate:** StrictMode, route navigation, duplicate components, parameter changes, anonymous/protected mixed sessions, and refresh/replay scenarios pass.

### P8 — Agent lifecycle, protocol, and tool progress

**Dependencies:** P3, P0 protocol profile.  
**Work:** normalized AG-UI mapping, native encoder, tool arguments/progress/results, parallel/sequential policy, output validation, context conversion/redaction, optional AI UI adapter.  
**Outputs:** server events with external protocol conformance.  
**Gate:** real external parser/client accepts fixtures; truncated tools never execute; tool-call end is not misreported as success; one terminal event per execution segment.

### P9 — Threads, controls, approval continuation, and useAgent

**Dependencies:** P2, P8.  
**Work:** idempotent run store, journal snapshots, segment IDs, interrupt decisions/checkpoints, safe queues, stop modes, reattachment, typed reducer/hook.  
**Outputs:** named agent chat with tools, controls, and honest recovery.  
**Gate:** refresh does not create another run; lost acknowledgements reconcile; all-open-interrupt resume obeyed; duplicate approval creates at most one accepted execution plan; unsafe worker recovery is interrupted.

### P10 — Inspector, examples, docs, and scaffolding

**Dependencies:** P6–P9.  
**Work:** implement the Inspector journey, complete docs navigation/pages/reference generation, link starter/client projects, wire executable examples and snippet tests. Earlier phases already add their reference/examples; this phase completes the connected journey.  
**Outputs:** usable end-to-end local demonstration and public docs.  
**Gate:** two-browser tutorial, Inspector approvals/recovery, clean app creation, docs build/search/link/reference/type checks, and all advertised hooks compile without generated imports.

### P11 — Shared providers, deployment, observability, release

**Dependencies:** all earlier phases.  
**Work:** test shared log/presence/run adapters, limits/load, fault injection, shutdown/drain, ingress behavior, capability diagnostics, migrations/changesets.  
**Outputs:** verified deployment capability matrix and release artifacts.  
**Gate:** multi-node failure/recovery and security tests pass; no production claim relies only on process-local tests; existing repository verification and release gates remain green.

Each phase is reviewed against working tests before later layers mask defects. A UI demo alone does not pass a provider, authorization, or protocol phase.

## 17. Mandatory acceptance matrix

| Test | Expected assertion |
|---|---|
| Public channel, anonymous browser | Subscribe and receive valid events without login. |
| Protected channel, no principal | Denied before any event, replay, or count is exposed. |
| Protected channel, wrong order/tenant | Denied even if socket authentication succeeded. |
| Mixed public/private connection | Private denial does not suppress permitted public subscriptions. |
| Missing/contradictory client policy | Compile/startup error; never default to public. |
| Revocation during queued replay | Stop affected delivery and presence; queued frames do not leak. |
| Native SSE vs WS security | Same guard/history/presence policy over both. |
| Public event binds | Unbound private-looking event is still public; docs/test fixture prevents relying on bind for secrecy. |
| Count before snapshot | Undefined/loading, not zero. |
| Two components, same params | One logical subscription and independent callbacks. |
| Two tabs, same principal | Two connections, one identified member. |
| Client death without close | Lease expires and counts converge within documented bounds. |
| Stalled SSE receiver | Renewal/ack expires; server writes alone do not renew forever. |
| Provider restart | Fresh presence epoch and snapshot; no stale joins replayed as live. |
| Presence profile | Only declared safe fields; no auth/session payload. |
| Known URL selector | Maps to the correct existing procedure/method contract. |
| Unknown/concrete/internal/raw-untyped selector | Compile error or clearly excluded contract. |
| Query select/infinite/suspense | Native selected-data/page/error inference preserved. |
| Mutation mounting | Zero server execution until explicit action. |
| Changing selector kind | Cannot switch useRoute into useMutation through a runtime hook branch. |
| Shared cache invalidation | Fetch, prefetch, optimistic updates and invalidation use identical scoped keys. |
| Offline write | No hidden resume/retry queue by default. |
| Logout/tenant switch during response | Old data, placeholder, mutation result and stream callbacks are discarded. |
| SSR | Fresh request-scoped auth/cache; no browser socket during render. |
| Reconnect replay/live fence | No gap or out-of-order handoff within a partition. |
| Cursor expired/foreign/future | Explicit gap/error and reauthorization, not silent acceptance. |
| Refresh event-derived UI | Snapshot restored before cursor advance. |
| Tool argument fragments | Incomplete JSON is display-only. |
| Truncated tool specification | Tool not executed. |
| Parallel tools complete out of order | Correct correlation and deterministic model transcript ordering. |
| Tool progress after settlement | Ignored/rejected safely; no event escapes closed scope. |
| Slow browser | Bounded backlog; does not hold engine durability barriers indefinitely. |
| Standard AG-UI client | Valid lifecycle, tool, snapshot, interrupt and resume decoding. |
| AI SDK UI adapter | Correct header/chunks/termination; no proxy cloning error. |
| Approval batch | Individual decisions collected; continuation covers all open interrupts. |
| Duplicate/conflicting approval | Same idempotent response or explicit conflict; no duplicate accepted tool plan. |
| Steering during active tool | Applied at safe boundary; no false hard-cancel claim. |
| Follow-up/run-end race | Exactly one accepted queue transition or explicit rejection. |
| Refresh agent | Same active run reattached, no repeated prompt/model request. |
| Worker lost during side effect | Unknown/interrupted outcome reported; no unsafe automatic repeat. |
| Inspector production/read-only boundary | Privileged actions remain protected/disabled and audited. |
| Docs/examples | New public API and all snippets match generated contract; no hand-edited generated imports. |

Use deterministic fake clocks/models/auth, seeded IDs, shared-provider integration fixtures, real browser tabs, and real connection failures. Keep compile-time fixtures, wire conformance, runtime validation, and operational load tests separate; success in one layer does not prove another.

## 18. Frozen lifecycle, recovery, security, and provider contracts

The contracts in this section are normative and supersede any less precise wording
earlier in this document. They preserve the existing oRPC/Hono transport, invocation,
provider, Bun, supervisor, Pulumi, TanStack, and generation machinery. Realtime and
agent-state remain separate provider capabilities. This release adds no service
membership, Pi dependency, browser tools, implicit offline write queue, automatic
uncertain-run recovery, contract negotiation, or second RPC protocol.

### 18.1 Requirement traceability

| ID | Capability | Status | Slice | Primary files | Executable acceptance |
|---|---|---|---:|---|---|
| STR-01 | streamOf inference and graph projection | required | 2 | functions, graph, compiler | Type/compiler fixtures |
| STR-02 | lazy lifecycle, validation, cancellation, backpressure | required | 2 | engine, invocation | Cleanup and blocked-flow tests |
| STR-03 | finite and tool progress | required | 2, 6 | functions, agents | Observed and unobserved progress |
| HTTP-01 | Typed oRPC iterators through Hono | required | 1, 2 | runtime-hono, client | Real Bun transport |
| HTTP-02 | Native SSE, text, and bytes | required | 2 | routes, runtime-hono | Post-header failure tests |
| HTTP-03 | Raw user-owned Hono escape hatch | required | 2 | routes | Mounted Hono fixture |
| RT-01 | Trigger, subscribe, bind | required | 3 | realtime, client | Trigger-to-browser journey |
| RT-02 | Internal, public, and protected exposure | required | 3, 4 | compiler, runtime | Negative access tests |
| RT-03 | Replay, recovery, fallback, overload | required | 3, 4, 9 | providers, client | Gap and restart tests |
| RT-04 | Connections, members, leases | required | 5 | realtime, client | Multi-tab and expiry tests |
| CLI-01 | Provider and public React hooks | required | 1-7 | client/react | Type and browser tests |
| CLI-02 | Query, mutation, infinite, suspense, utilities | required | 1 | client, compiler | Native inference fixtures |
| CLI-03 | Registry, artifacts, build adapters, drift | required | 1 | generator, CLI, client | Clean-checkout fixture |
| CLI-04 | SSR, identity, hydration, compatibility | required | 1, 4 | client, auth, runtime | Scoped hydration |
| AG-01 | Text, parts, tools, progress, results | required | 6 | agents, reducer | Incremental protocol |
| AG-02 | Threads, claims, controls, generations | required | 0, 7 | agents, providers | Crash and race tests |
| AG-03 | Applicable Pi behavior and deferrals | required | 0, 6 | compatibility fixtures | Capability matrix |
| AG-04 | AG-UI and AI SDK interoperability | required | 6 | agents, runtime, ai-sdk | External parsers |
| SVC-01 | Existing-service composition | required | 2, 6 | function engine | Service stream and agent |
| INS-01 | Inspector routes, channels, chat | required | 8 | inspector app/API | Browser journey |
| EX-01 | Backend and Next.js examples | required | all, 10 | commerce examples | Executable journeys |
| DOC-01 | Tutorials, reference, operations | required | all, 10 | docs app | Documentation verification |
| BUILD-01 | Graph, manifests, exports, templates | required | 0-10 | compiler, CLI, scaffold | Generated application |
| OPS-01 | Providers, limits, deployment, observability | required | 9, 10 | local, Redis, deploy | Two-node tests |

### 18.2 Identity, compatibility, and managed writes

The server-derived principal authorizes access. identityScope, sessionEpoch, and a
manual identityKey only partition client state. GET /_relkit/v1/client/identity is
non-cacheable and returns protocol relkit.client-identity version 1, applicationId,
opaque identityScope, sessionEpoch, publicFingerprint, and issuedAt. It sends
Cache-Control: no-store, private; Pragma: no-cache; Vary: Cookie, Authorization,
Origin; and X-Content-Type-Options: nosniff.

Managed mutations, run acceptance, controls, continuation, AG-UI, and AI UI writes
carry the expected identity scope and session epoch. The server independently
authenticates and compares them before middleware target logic or any state change.
A mismatch returns IDENTITY_PRECONDITION_FAILED and executes zero application,
model, tool, or control work. Tenant and resource authorization follows a successful
precondition check.

The public fingerprint covers exposed contracts and protocol requirements, not
unrelated internal graph nodes. Equality is exact. A mismatch enters
application-updated, blocks new typed queries, mutations, runs, and controls, and
preserves unresolved-operation metadata. Compatible read-only observation of a
pinned run may continue. Even an additive public change can block an old browser.
Deployment guidance must distinguish unchanged fingerprints, changed fingerprints,
and requests still routed to a matching old deployment.

Pending-operation metadata is scoped sessionStorage data containing only operation
kind, IDs, resource/thread/run IDs, request digest, time, and submitted/accepted/
unknown state. It never contains prompts, variables, tool arguments, credentials, or
a retry payload. Agent receipts reconcile without resubmission. Arbitrary mutations
remain unknown unless the application supplies reconciliation.

Request-scoped SSR and browser keys contain backend/application, opaque identity,
session epoch, manual tenant identityKey, public fingerprint, operation kind,
procedure ID, and canonical input. Hydration installs only on a complete match.
Fresh hydrated data avoids unintended duplicate requests for its configured staleTime;
intentional stale revalidation is valid. identityKey null blocks private restoration.

### 18.3 Route and streaming boundaries

client false is a server exposure restriction: neither the existing route-ID
procedure nor method/path alias is registered, and direct calls to both identities
return non-enumerating NOT_FOUND. Raw routes never get RPC procedures. Native and RPC
materialization share one policy runner for auth, middleware, limits, timeout, error
mapping, telemetry, and canonical method/path. Policy that cannot be reproduced over
RPC is a compile error until client false is explicit.

streamOf projects as a stream item schema and invoke returns a lazy, single-consumer
AsyncIterable. Work and invocation capacity start on first next. A second consumer
fails with RELKIT_STREAM_ALREADY_CONSUMED. Scope remains pinned through completion,
abort, return, disconnect, shutdown, or a 45-second post-start consumer-idle timeout.
Queues are bounded to 32 items and 4 MiB encoded; one item is at most 1 MiB encoded.
Oversized values fail immediately with RELKIT_STREAM_ITEM_TOO_LARGE. Cancellation
unblocks both sides and runs upstream return and cleanup once. Stream functions cannot
be tools in this release.

Finite request timeout, stream establishment timeout, heartbeat/idle detection, and
agent execution deadlines are separate. A healthy established stream has no
30-second lifetime cap. Handing a write to fetch followed by timeout/disconnect has
unknown outcome and is never silently retried.

Declared progress is schema-validated and capped at 256 KiB encoded. Unary invocation
uses a validate-and-discard ProgressSink unless an observer is supplied, so an
unconsumed queue cannot deadlock completion. Agent tools use a durable journal sink.
Browser observer backpressure never blocks journal acceptance or execution; slow
observers detach with SLOW_CONSUMER. Replaceable progress may coalesce, terminal and
approval records may not.

Native SSE writes relkit-item and explicit relkit-complete or sanitized relkit-error
events. Text accepts strings and bytes accepts bytes. After headers, text/bytes abort
on failure and are not recorded as success. Real Bun/Hono tests determine transport
behavior; callers needing explicit terminal semantics use managed streaming or SSE.

### 18.4 Realtime recovery and presence

Fresh channel mount creates a provider tail fence, attaches live delivery gap-free,
then becomes caught up; it does not replay all history. Initial application state
comes from an authoritative route query and onCaughtUp performs final invalidation or
revision checking. Reconnect with replay consumes strictly after the last applied
checkpoint after reauthorization. Without replay it reports a gap and starts a new
fence. Full refresh persists no raw cursor by default because Relkit does not own
callback-derived state. A cursor without corresponding state is never recovery.

Expired, foreign, future, old-policy, old-session, or old-provider-epoch checkpoints
produce typed gaps. caughtUp stays false until asynchronous onGap restoration finishes
or the subscription is abandoned. Presence always reloads a fresh snapshot.

Member presence uses exactly member, resolve, and maxMembers and is legal only on a
protected channel. Count presence exposes connections, freshness status, revision,
and scope but no member fields. Member presence additionally exposes memberCount,
typed members, and truncation. Member IDs are opaque, stable, and scope-bound; raw
authentication IDs are forbidden. maxMembers limits returned results, not admission.
The provider readPresence operation is side-effect free and applies the same
authorization and limits.

Realtime receipt lookup distinguishes found, current-epoch not-found, expired, and
state-lost. Trigger idempotency keys are Relkit-validated UUIDv7 values. Future values
beyond five minutes and first submissions older than the 24-hour window fail.
Matching retries return the original receipt; conflicting semantic content fails.
UUIDv7 time makes expiry enforceable after pruning. state-lost preserves unknown
outcome. Append and receipt persistence are atomic. An omitted key can duplicate
after a lost response; database atomicity requires an application outbox.

Replay uses read, register wait intent, re-read, then bounded wait. Notifications are
only an optimization. Filesystem providers use cross-process watching plus mandatory
polling, default 250 ms and configurable from 50 to 1000 ms. Redis reads are bounded
and recheck state. Redis channel fanout uses XREAD per gateway, not one shared consumer
group.

### 18.5 Agent snapshots, claims, completion, and controls

Mounting useAgent never creates a thread, accepts a run, invokes a model/tool, or
submits a control. With a threadId it may load authorized state and observe it.
loadThread atomically returns one pinned ThreadSnapshot and matching journal
checkpoint. The browser fully installs it and then consumes records strictly after
that checkpoint. Older completed history uses authenticated finite-oRPC cursor pages
tied to snapshotId. Initial snapshot and pages are each capped at 4 MiB; active state
must fit initial admission.

Thread status and run status are distinct. A settled segment returns its thread to
idle only when no approval or queued follow-up remains; historical run state is
immutable. approval-interrupted and worker-interrupted never become idle in a way
that restarts uncertain work. The stopping state rejects sends and approvals, rejects
steer/follow-up, and treats the same stop idempotently while allowing an immediate
request to escalate graceful stop.

Claims contain claim ID, worker and generation owner, monotonic fence, and expiry.
Expired or superseded claims cannot append, complete, or settle. Fencing protects
stored state, not external effects, which are never automatically repeated when
uncertain.

Completion first authenticates and checks ownership, then looks up a receipt bound to
thread, run, caller scope, and semantic digest. A matching duplicate returns the
original receipt even after claim release or expiry; conflict fails. Only a missing
receipt requires a live claim. One transaction commits outcome, checkpoint, terminal
journal, thread transition, claim release, and receipt. Each active run reserves four
terminal records and 32 KiB, released when terminal data enters history.

interruptOwnedRun is provider-owned and compares expected owner, claim, fence, and
nonterminal state. An expired executor gains no special write authority. It cannot
overwrite a newer claim or terminal run, and a new claim does not clear uncertainty.

Controls have durable accepted, processing, applied, rejected, or cancelled status
and not-started, confirmed, or unknown effect. readControls plus bounded
waitForControls makes controls admitted through a newer generation discoverable by
the owning generation. Claims prevent competing application. A dequeued control is
not applied until settlement. Provider-owned recoverAbandonedControl compares fences,
reconciles downstream receipts first, returns definitely unstarted work to pending,
settles possible unreceipted effects unknown, and never overwrites newer state.

Continuation identity is threadId, interruptedRunId, and interruptSetDigest.
admitContinuation atomically verifies ownership/resource authorization and all open
decisions, reuses a stable receipt, transitions the thread, creates exactly one run,
and persists the receipt. Concurrent final decisions cannot admit multiple segments.

Trusted run metadata stores owning generation, fingerprint, schema/protocol versions,
and provider scope. New work selects the active generation; nested work and triggers
remain invocation-bound. A newer generation may serve authorized journal reads only
with compatible interpretation and may persist controls for the owner to consume.
Execution and continuation never migrate. Missing owner returns
GENERATION_UNAVAILABLE, preserves visible interruption, and never restarts work.

### 18.6 Mandatory transport and agent security

Browser WebSocket upgrades validate Origin against an exact allowlist before upgrade.
Production cookie upgrades with missing, null, wildcard, malformed, or disallowed
origins fail. Non-browser access requires explicit trusted service credentials.
State-changing HTTP, including mutations, agent operations, AG-UI/AI UI POSTs, and
native writes, passes CSRF validation before execution. Cross-origin cookie requests
need an explicitly allowed origin and session-bound CSRF header/token.

Credentialed CORS never emits wildcard allow-origin. It emits credentials only for a
configured origin, limits preflight methods/headers, and varies on Origin. CORS is
neither authentication nor authorization.

Protected agent creation requires current resource authorization and atomically binds
the authenticated owner. Every load, snapshot, receipt lookup, replay, observation,
run acceptance, control, continuation, AG-UI/AI UI access, and output disclosure
requires both current resource authorization and verified thread ownership. IDs and
checkpoints grant nothing. Checks occur before existence-sensitive details. Public
agents apply the same rule using visitor-cookie ownership. Cookie loss, replacement,
or expiry changes identity scope and clears old private transcript/checkpoint state.

Browser journals contain only schema-validated public projections. Authorized user
messages remain visible. Internal/provider prompts, raw provider payloads,
credentials, private context, and private reasoning never enter browser-visible
contracts.

### 18.7 Encoded and aggregate limits

All byte limits apply after semantic validation to the fully encoded selected
protocol envelope. Channel events and command/ack frames are 64 KiB; agent journal,
progress, and tool records are 256 KiB; generic stream items are 1 MiB; managed
transport frames are 1.25 MiB; per-connection queued frames are 4 MiB; initial
snapshots and history pages are 4 MiB over finite HTTP. A value accepted upstream
must fit every downstream boundary. Oversized agent output fails with
AGENT_OUTPUT_TOO_LARGE rather than truncating.

Defaults are 128 subscriptions per connection, 10,000 active partitions and live
connections per app, 256 MiB retained channel data per app/profile, 1,000 returned
presence members, 16 MiB journal per thread, 1 GiB agent state per app/profile, 100
threads per principal, 4/100 active runs per principal/app, and 32/10,000 queued
controls per run/app. Principal overload is typed 429; app/provider overload is typed
503. Existing work is not evicted for admission.

## 19. Implementation slices and gates

0. Freeze concrete provider, identity, receipt, claim, completion, interruption,
   control, continuation, snapshot, limit, and protocol contracts; bump contract and
   generator 5 to 6 and graph and manifest 8 to 9 while retaining API v1.
1. Implement finite client registry, route-ID/method-path aliases, client-false
   exclusion, policy parity, React/TanStack hooks, identity bootstrap, exact
   fingerprint, pending metadata, SSR, hydration, CLI pull/check, and Next/Vite
   adapters.
2. Implement streamOf, lazy engine lifecycle, ProgressSink, bounded queues, native
   formats, oRPC iterators, useStream, service composition, and raw Hono fixture.
3. Implement public channels, receipts, epochs, replay, managed WebSocket/http-stream,
   filesystem provider, gap/caught-up behavior, polling fallback, and aggregate
   admission.
4. Implement Origin/CORS/CSRF, protected grants, history boundaries, renewal,
   revocation, queued-frame invalidation, expected-session writes, identity changes,
   and authoritative restoration.
5. Implement exact presence authoring, provider readPresence, backend getPresence,
   conditional types, leases, members, truncation, epochs, and limits.
6. Implement agent descriptor metadata and conditional controls, incremental
   content/tool/progress, redaction, AG-UI 0.0.59, AI SDK 7.0.79, and external parser
   fixtures.
7. Implement atomic snapshots and history, receipt states, claims, completion,
   interruption, controls, recovery, continuation, useAgent, WebSocket proxying,
   generation retention, and stale-session prevention.
8. Implement Inspector agent/channel/stream experiences under apps/inspector/app
   using its existing privileged production boundary.
9. Add separate redisRealtime and redisAgentState integrations, preserving redis
   cache, with Streams fanout, presence, claims, controls, polling, epochs, limits,
   recovery, observability, and deployment settings.
10. Extend commerce, add commerce-web and the explicit fullstack template, register
    exports/references/changesets, add deterministic CI fixtures, and deliver all
    client, realtime, HTTP streaming, AI, Inspector, provider, security, limits,
    troubleshooting, and deployment documentation.

Each slice lands its negative type/security fixtures and end-to-end executable path,
rather than deferring integration to Slice 10. The final verification matrix is:
typecheck, check, test:types, test:packages, test:compiler, test:integration,
test:restart, test:inspector, test:inspector:browser, test:e2e, test:generator,
test:examples, test:docs, test:deployment, test:security, test:local-docker, and
verify. Cloud acceptance remains opt-in and requires authorization.

## 20. Sources and review scope

Repository files and primary upstream documentation were reviewed for this specification. External projects evolve; the exact installed package/version compatibility remains an explicit implementation gate. The review found existing oRPC TanStack support in Relkit and reviewed Pi's current event/control semantics and AG-UI's current schemas/interrupt lifecycle. It did not execute the proposed framework APIs or publish docs.

[R1]: https://github.com/rel-kit/relkit/blob/602b54ddd84b65b1bdfd2098adfa6876b2abc1ba/packages/client/package.json
[R2]: https://github.com/rel-kit/relkit/blob/602b54ddd84b65b1bdfd2098adfa6876b2abc1ba/packages/client/src/tanstack-query.ts
[R3]: https://github.com/rel-kit/relkit/blob/602b54ddd84b65b1bdfd2098adfa6876b2abc1ba/packages/agents/package.json
[R4]: https://github.com/rel-kit/relkit/blob/602b54ddd84b65b1bdfd2098adfa6876b2abc1ba/packages/client/src/index.ts
[R5]: https://github.com/rel-kit/relkit/blob/602b54ddd84b65b1bdfd2098adfa6876b2abc1ba/packages/client-generator/src/generate-contract.ts
[R6]: https://github.com/rel-kit/relkit/blob/602b54ddd84b65b1bdfd2098adfa6876b2abc1ba/packages/runtime-hono/src/rpc.ts
[R7]: https://github.com/rel-kit/relkit/blob/602b54ddd84b65b1bdfd2098adfa6876b2abc1ba/apps/docs/content/docs/meta.json
[R8]: https://github.com/rel-kit/relkit/blob/602b54ddd84b65b1bdfd2098adfa6876b2abc1ba/apps/docs/content/docs/http/meta.json
[PI1]: https://github.com/earendil-works/pi/blob/e687434a60174db1a9c961d973881a7a851a0597/packages/agent/README.md
[PI2]: https://github.com/earendil-works/pi/blob/e687434a60174db1a9c961d973881a7a851a0597/packages/agent/src/types.ts
[PI3]: https://github.com/earendil-works/pi/blob/e687434a60174db1a9c961d973881a7a851a0597/packages/agent/src/agent-loop.ts
[P1]: https://pusher.com/docs/channels/using_channels/private-channels/
[P2]: https://pusher.com/docs/channels/using_channels/presence-channels/
[P3]: https://pusher.com/docs/channels/using_channels/events/#pusher-subscription-count-event
[O1]: https://orpc.dev/docs/integrations/tanstack-query
[O2]: https://orpc.dev/docs/async-iterator-object
[O3]: https://orpc.dev/docs/integrations/ai-sdk
[H1]: https://hono.dev/docs/helpers/streaming
[G1]: https://docs.ag-ui.com/introduction
[G2]: https://docs.ag-ui.com/concepts/events
[G3]: https://docs.ag-ui.com/concepts/metadata
[G4]: https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/typescript/packages/core/src/events.ts
[G5]: https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/typescript/packages/core/package.json
[G6]: https://docs.ag-ui.com/concepts/interrupts
[A1]: https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/50-stream-protocol.mdx
[F1]: https://react.dev/reference/rules/rules-of-hooks
[T1]: https://tanstack.com/query/latest/docs/framework/react/guides/network-mode
[N1]: https://nextjs.org/docs/app/getting-started/server-and-client-components
[W1]: https://html.spec.whatwg.org/multipage/server-sent-events.html
[W2]: https://websockets.spec.whatwg.org/
[D1]: https://redis.io/docs/latest/develop/pubsub/

| Source group | Why it matters |
|---|---|
| Relkit repository [R1–R8] | Real package seams, existing TanStack support, type generation, RPC path, and docs navigation. |
| Pi agent source [PI1–PI3] | Detailed lifecycle/control/tool/context behavior used in the gap review. |
| Pusher docs [P1–P3] | Public/private/presence inspiration and connection-vs-member semantics. |
| oRPC/Hono [O1–O3, H1] | Existing typed query/stream and HTTP/WS adapter foundations. |
| AG-UI [G1–G6] | Public event schemas, metadata and interrupt/resume conformance. |
| AI SDK [A1] | Optional ecosystem-compatible UI stream encoding. |
| React/TanStack/Next [F1, T1, N1] | Hook call order, offline scheduling, and SSR/client boundaries. |
| Browser/Redis [W1, W2, D1] | Transport limitations and the difference between reconnect and retained recovery. |

**Deliverable verification:** implementation evidence belongs in repository tests and
release checks. This document defines behavior; it does not substitute for those
checks.
