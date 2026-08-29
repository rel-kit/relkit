import { defineBetterAuthService } from "@relkit/better-auth";

export default defineBetterAuthService({
  baseURL: "http://127.0.0.1:3000",
  secret: "development-only-auth-secret-32-characters",
});
