import type { SourceLocation } from "@relkit/contracts";

export interface ServiceMemberRef {
  readonly name: string;
  readonly functionId: string;
}

export interface ServiceMiddlewareRef {
  readonly id: string;
}

export interface ServiceNode {
  readonly kind: "service";
  readonly id: string;
  readonly source: SourceLocation;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly members: readonly ServiceMemberRef[];
  readonly middleware: readonly ServiceMiddlewareRef[];
}

export interface ServiceMemberEdge {
  readonly kind: "contains-function";
  readonly from: string;
  readonly to: string;
  readonly member: string;
  readonly order: number;
}

export interface ServiceMiddlewareEdge {
  readonly kind: "uses-service-middleware";
  readonly from: string;
  readonly to: string;
  readonly order: number;
}
