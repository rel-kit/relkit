#!/usr/bin/env bun
/** Linux image entry requires explicit persistent mounts before acquiring the tool. */
import { runInspectorMain } from "./tool-main.js";
runInspectorMain(true);
