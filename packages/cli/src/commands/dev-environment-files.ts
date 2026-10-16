/**
 * Selects Bun's standard runtime dotenv inputs for development sessions.
 * Watchers and environment resolution share this policy; example files never
 * become runtime inputs and no file contents enter prepared snapshot receipts.
 */

/**
 * Lists dotenv inputs in increasing precedence for a fixed process mode.
 * @param mode - Startup NODE_ENV; Bun defaults an absent value to development.
 * @returns Standard dotenv paths, excluding local overrides in test mode.
 */
export function developmentEnvironmentFiles(mode: string | undefined): readonly string[] {
  const selected = mode === "production" || mode === "test" ? mode : "development";
  const files = [".env", `.env.${selected}`];
  if (selected !== "test") files.push(".env.local");
  files.push(`.env.${selected}.local`);
  return files;
}

/**
 * Recognizes standard dotenv event paths without accepting informational examples.
 * @param path - Project-relative native event path.
 * @returns Whether this path is a supported runtime dotenv file.
 */
export function isDevelopmentEnvironmentFile(path: string): boolean {
  return ["development", "production", "test"].some((mode) =>
    developmentEnvironmentFiles(mode).includes(path),
  );
}
