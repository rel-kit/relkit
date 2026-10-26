/** Maps users GET requests to the service's email-domain model query through the inferred HTTP contract. */
import { defineRoute } from "@relkit/app/routes";
import users from "@app/services/users/service.js";

export const GET = defineRoute({ target: users.listUsers });
