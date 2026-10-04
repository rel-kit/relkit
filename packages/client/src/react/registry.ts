// Compatibility type entry; declaration-merging authorities retain this module identity.

/**
 * Augmentable application registry of exact procedure contracts.
 */
export interface ClientRegistry {}

/**
 * Augmentable application registry of declared channel contracts.
 */
export interface ChannelRegistry {}

/**
 * Augmentable application registry of declared agent contracts.
 */
export interface AgentRegistry {}

export type * from "./registry.types.js";
