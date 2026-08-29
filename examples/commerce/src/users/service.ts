import { defineService } from "@relkit/app/services";
import databaseUsers from "./functions/database-users.function.js";

export default defineService({ functions: { databaseUsers } });
