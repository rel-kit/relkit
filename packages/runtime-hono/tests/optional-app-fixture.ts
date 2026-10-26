/**
 * Makes native transport selection explicit in compatibility fixtures. These
 * wrappers borrow already imported installers and preserve the core application's
 * configuration, request ownership and synchronous failure behavior.
 */
import { createApp as coreApp } from "../src/create-app.js";
import { installMcp } from "../src/mcp.js";
import { installAgentProtocolEndpoints } from "../src/agent-protocol.js";

/** Selects the native MCP installer for an MCP-focused fixture.
 * @param options - Original checked application options.
 * @returns Synchronously initialized application with MCP explicitly selected.
 */
export const createMcpApp: typeof coreApp = (options) =>
  coreApp({
    ...options,
    mcp: { enabled: true },
    optionalTransports: { ...options.optionalTransports, mcp: installMcp },
  });

/** Selects the native AG-UI installer for an AG-UI-focused fixture.
 * @param options - Original checked application options.
 * @returns Synchronously initialized application with AG-UI explicitly selected.
 */
export const createAgUiApp: typeof coreApp = (options) =>
  coreApp({
    ...options,
    agUi: true,
    optionalTransports: { ...options.optionalTransports, agUi: installAgentProtocolEndpoints },
  });
