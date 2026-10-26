/** Registers the retained langgraph-authoring scenarios in their original order with cohesive case fixtures. */
import { describe, test } from "bun:test";
import {
  case1Workflow,
  case2Workflow,
  case3Workflow,
} from "./langgraph-authoring.workflow.cases.js";
import {
  case4Metadata,
  case5Metadata,
  case6Metadata,
} from "./langgraph-authoring.metadata.cases.js";
describe("LangGraph compiler metadata", () => {
  test("discovers defineGraph as an optional-id agent factory", case1Workflow);
  test("keeps the inspectable workflow on the agent node", case2Workflow);
  test("derives Inspector topology without evaluating graph routes", case3Workflow);
  test("emits exact native client metadata without runtime instances", case4Metadata);
  test("projects only safe subagent and resource dependency metadata", case5Metadata);
  test("projects native agent function dependencies as refs only", case6Metadata);
});
