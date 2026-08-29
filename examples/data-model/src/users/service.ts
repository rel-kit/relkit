import { defineService } from "@relkit/app/services";
import listUsers from "./functions/list-users.function.js";

export default defineService({ functions: { listUsers } });
