/**
 * 27.1 through the development front on Node: a malformed `Host`, a leading `//`, a blocked
 * inspection path, a throw in the front, a read that carries a body and pipelined requests.
 */
import { afterAll, beforeAll, expect, test } from "vitest";
import { declareFrontSuite } from "./front-request.suite.ts";

declareFrontSuite({ test, beforeAll, afterAll, expect }, true);
