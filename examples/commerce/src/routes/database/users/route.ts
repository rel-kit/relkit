/** Maps GET to the users service's database listing with its inferred request and response contract. */
import { defineRoute } from "@relkit/app/routes";
import users from "../../../services/users/service.js";

export const GET = defineRoute({ target: users.databaseUsers });
