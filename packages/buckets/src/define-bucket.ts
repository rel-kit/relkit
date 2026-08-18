import {
  createDescriptorBase,
  deepFreeze,
  isDescriptor,
  normalizeId,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@zsys/contracts";

export type BucketVisibility = "private" | "public";

export interface BucketDescriptor<Id extends string> extends DescriptorBase<"bucket", Id> {
  readonly profile?: string;
  readonly visibility: BucketVisibility;
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

export type BucketDescriptorAny = BucketDescriptor<string>;

export interface DefineBucketOptions<Id extends string> extends DescriptorMetadata {
  readonly id: Id;
  readonly profile?: string;
  readonly visibility: BucketVisibility;
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

export function defineBucket<const Id extends string>(
  options: DefineBucketOptions<Id>,
): BucketDescriptor<Id> {
  if (!isRecord(options)) throw new TypeError("Bucket options must be an object");
  if (hasOwn(options, "handler")) throw new TypeError("Buckets cannot own handlers");
  if (options.visibility !== "private" && options.visibility !== "public") {
    throw new TypeError("Bucket visibility must be private or public");
  }

  const profile = options.profile === undefined ? undefined : normalizeId(options.profile);
  const maxObjectBytes =
    options.maxObjectBytes === undefined
      ? undefined
      : positiveInteger(options.maxObjectBytes, "maxObjectBytes");
  const allowedContentTypes = copyContentTypes(options.allowedContentTypes);
  const base = createDescriptorBase("bucket", options.id, options);

  return deepFreeze({
    ...base,
    visibility: options.visibility,
    ...(profile === undefined ? {} : { profile }),
    ...(maxObjectBytes === undefined ? {} : { maxObjectBytes }),
    ...(allowedContentTypes === undefined ? {} : { allowedContentTypes }),
  }) as BucketDescriptor<Id>;
}

export function isBucketDescriptor(value: unknown): value is BucketDescriptorAny {
  if (!isRecord(value) || !isDescriptor(value, "bucket")) return false;
  const descriptor = value as BucketDescriptorAny;
  return (
    (descriptor.profile === undefined || isStableProfile(descriptor.profile)) &&
    (descriptor.visibility === "private" || descriptor.visibility === "public") &&
    (descriptor.maxObjectBytes === undefined || isPositiveInteger(descriptor.maxObjectBytes)) &&
    (descriptor.allowedContentTypes === undefined ||
      isContentTypeList(descriptor.allowedContentTypes))
  );
}

export function assertBucketDescriptor(value: unknown): asserts value is BucketDescriptorAny {
  if (!isBucketDescriptor(value)) throw new TypeError("Invalid bucket descriptor");
}

function copyContentTypes(value: readonly string[] | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("Bucket allowedContentTypes must be an array");
  if (value.length === 0) {
    throw new TypeError("Bucket allowedContentTypes must not be empty");
  }
  const types = value.map((contentType) => {
    if (typeof contentType !== "string" || !isContentType(contentType.trim())) {
      throw new TypeError(`Invalid bucket content type "${String(contentType)}"`);
    }
    return contentType.trim();
  });
  if (new Set(types).size !== types.length) {
    throw new TypeError("Bucket allowedContentTypes must be unique");
  }
  return Object.freeze(types);
}

function isContentTypeList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    new Set(value).size === value.length &&
    value.every((contentType) => typeof contentType === "string" && isContentType(contentType))
  );
}

function isContentType(value: string): boolean {
  return /^(?:[A-Za-z0-9!#$&^_.+-]+|\*)\/(?:[A-Za-z0-9!#$&^_.+-]+|\*)$/.test(value);
}

function positiveInteger(value: unknown, name: string): number {
  if (!isPositiveInteger(value)) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isStableProfile(value: unknown): value is string {
  try {
    normalizeId(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
