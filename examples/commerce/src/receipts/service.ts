import { defineService } from "@relkit/app/services";
import sendReceipt from "./functions/send-receipt.function.js";

export default defineService({ functions: { sendReceipt } });
