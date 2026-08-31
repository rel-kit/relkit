import { defineService } from "@relkit/app/services";
import listUsers from "./functions/list-users.function.js";
import registerMember from "./functions/register-member.function.js";
import updateUserEmail from "./functions/update-user-email.function.js";

export default defineService({ functions: { listUsers, registerMember, updateUserEmail } });
