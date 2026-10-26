/** Registers the retained add-transaction scenarios in their original order with cohesive case fixtures. */
import { describe, test } from "bun:test";
import {
  case1Validation,
  case3Validation,
  case4Validation,
} from "./add-transaction.validation.cases.js";
import { case2Rollback, case5Rollback } from "./add-transaction.rollback.cases.js";
describe("add scaffold transaction", () => {
  test("validates with the project CLI instead of an unrelated global install", case1Validation);
  test("restores bytes, modes, lockfile, and leaves unrelated dirty files", case2Rollback);
  test("rolls back validation failure and applies a successful plan", case3Validation);
  test("skips checking unavailable packages with no install", case4Validation);
  test("refuses project-local symlinks without writing through them", case5Rollback);
});
