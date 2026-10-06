/** Pure boot metadata helpers run before the generation lifetime is acquired. */
export const SERVER_BOOTSTRAP_SOURCE = `
function tokenFrom(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
function readLocalServiceInspectorState(value) {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  return { lease: { status: "blocked" } };
}
function resolveEnvironment(value, nodeEnvironment) {
  if (value === "development" || value === "test" || value === "production") return value;
  return nodeEnvironment === "production" ? "production" : "development";
}
`;
