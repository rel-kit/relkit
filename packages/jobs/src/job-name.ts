import { JOB_NAME_MAX_LENGTH } from "@relkit/contracts/jobs";

export const JOB_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/u;
export const JOB_NAME_RESERVED = [
  "then",
  "constructor",
  "prototype",
  "toJSON",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "__proto__",
] as const;

type LowercaseLetter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type NameCharacter = LowercaseLetter | UppercaseLetter | Digit;
type UppercaseLetter = Uppercase<LowercaseLetter>;
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type ValidCharacters<Value extends string> = Value extends ""
  ? true
  : Value extends `${infer Character}${infer Rest}`
    ? Character extends NameCharacter
      ? ValidCharacters<Rest>
      : false
    : false;
type AtMost64<Value extends string, Count extends readonly unknown[] = []> = Value extends ""
  ? true
  : Count["length"] extends typeof JOB_NAME_MAX_LENGTH
    ? false
    : Value extends `${infer _Character}${infer Rest}`
      ? AtMost64<Rest, [...Count, unknown]>
      : false;

export type ValidJobName<Name extends string = string> = string extends Name
  ? never
  : Name extends (typeof JOB_NAME_RESERVED)[number]
    ? never
    : Name extends `${LowercaseLetter}${infer Rest}`
      ? ValidCharacters<Rest> extends true
        ? AtMost64<Name> extends true
          ? Name
          : never
        : never
      : never;

export type JobName<Name extends string = string> = string extends Name ? string : ValidJobName<Name>;

export function isJobName(value: unknown): value is JobName {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= JOB_NAME_MAX_LENGTH &&
    JOB_NAME_PATTERN.test(value) &&
    !JOB_NAME_RESERVED.includes(value as (typeof JOB_NAME_RESERVED)[number])
  );
}

export const isValidJobName = isJobName;

export function assertJobName(value: unknown, source = "job name"): asserts value is JobName {
  if (isJobName(value)) return;
  throw new TypeError(
    `${source} must be 1–64 ASCII characters matching ^[a-z][A-Za-z0-9]*$ and not a reserved name`,
  );
}

export function validateJobName<const Name extends string>(value: Name): ValidJobName<Name> {
  assertJobName(value);
  return value as ValidJobName<Name>;
}

export function normalizeJobName<const Name extends string>(value: Name): ValidJobName<Name> {
  return validateJobName(value);
}
