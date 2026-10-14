/** Declares the users service boundary without acquiring native clients. */
import { defineService } from "@relkit/app/services";
import databaseUsers from "./functions/database-users.function.js";

export default defineService({ functions: { databaseUsers } });
