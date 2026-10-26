/**
 * Shares backend listener/body limits through an explicitly imported Platform
 * fragment. The application config merges this plain descriptor; importing it
 * starts no listener and selects no optional integration or Inspector tool.
 */
export const server = { port: 3000, maxBodyBytes: 1_048_576 };
