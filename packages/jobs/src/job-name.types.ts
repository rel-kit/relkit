import type { JOB_NAME_MAX_LENGTH } from "@relkit/contracts/jobs";
import type { JOB_NAME_RESERVED } from "./job-name.js";

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

/** Compile-time predicate for a literal job name. */
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

/** A validated job name, preserving literal types when available. */
export type JobName<Name extends string = string> = string extends Name
  ? string
  : ValidJobName<Name>;
