/** Describes exact creation tuples and their recorded package, tool and template evidence identities. */

import type { CreateOptions } from "./options.js";

/** Complete public creation combination; absence of jobs preserves the native no-jobs option. */
export interface CreateCapabilityTuple {
  /** Authored starter selected by the public CLI. */
  readonly template: CreateOptions["template"];
  /** Explicit cloud ownership selection. */
  readonly cloud: CreateOptions["cloud"];
  /** Explicit deployment engine selection. */
  readonly deploy: CreateOptions["deploy"];
  /** Optional durable-job integration selection. */
  readonly jobs?: CreateOptions["jobs"];
  /** Whether the starter's example sources are retained. */
  readonly examples: boolean;
}

/** Every field must match the running packaged tool before a tuple is offered. */
export interface CreateCapabilityIdentity {
  /** Exact first-party release version. */
  readonly release: string;
  /** Pinned native Bun version. */
  readonly bun: string;
  /** Exact TypeScript package version. */
  readonly typescript: string;
  /** SHA-256 of the complete tool dependency catalog. */
  readonly packageCatalogDigest: string;
  /** Exact source template directory identity. */
  readonly template: string;
  /** Prepared-input snapshot protocol version. */
  readonly snapshotProtocol: number;
}

/** Offered tuple backed by complete fresh and restart measurements for its template bytes. */
export interface CreateCapabilityEvidence extends CreateCapabilityTuple {
  /** Exact tool and package catalog identity measured by the recorded certification host. */
  readonly identity: CreateCapabilityIdentity;
  /** SHA-256 over ordered template paths and their complete bytes. */
  readonly templateDigest: string;
  /** Repository-relative complete 20-attempt fresh report. */
  readonly freshEvidence: string;
  /** Repository-relative complete 20-attempt restart report. */
  readonly restartEvidence: string;
}

/** Unresolved interactive choices used only to filter certified complete tuples. */
export type PartialCreateCapability = Readonly<{
  /** Optional starter choice. */
  template?: string;
  /** Optional cloud choice. */
  cloud?: string;
  /** Optional deployment choice. */
  deploy?: string;
  /** Optional job choice; undefined retains the native prompt semantics. */
  jobs?: string | undefined;
  /** Optional example choice. */
  examples?: boolean;
}>;
