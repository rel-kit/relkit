/** Registers the retained add-resolver scenarios in their original order with cohesive case fixtures. */
import { test } from "bun:test";
import { case1Add, case2Add, case3Add, case4Add } from "./add-resolver.add.cases.js";
import { case5Creation, case6Creation, case7Creation } from "./add-resolver.creation.cases.js";
import { case8Policy, case9Policy, case10Policy } from "./add-resolver.policy.cases.js";
test("resolves an interactive add through the same normalized request", case1Add);
test("uses unique services and explicit model selectors headlessly", case2Add);
test("offers existing functions and function creation when adding a tool", case3Add);
test("creates a function for a new service and respects explicit creation headlessly", case4Add);
test("asks for name, template, jobs and destination while keeping silent defaults", case5Creation);
test("rejects unsupported explicit creation flags without any setup question", case6Creation);
test("offers the certified starter template and honors a custom destination", case7Creation);
test("rejects an uncertified inline template after filtering jobs", case8Policy);
test("hides uncertified jobs providers interactively", case9Policy);
test("retains headless defaults without requesting interactive choices", case10Policy);
