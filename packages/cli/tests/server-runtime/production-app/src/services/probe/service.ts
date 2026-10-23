/** Owns the production probe function, immutable task descriptor and durable job binding. */
import { defineService } from "@relkit/app/services";
import { defineJob } from "@relkit/app/jobs";
import task from "./tasks/double.task.js";
import submit from "./functions/submit.function.js";

const probe = defineJob({ name: "probe", id: "probe.run", task });
export default defineService({ functions: { submit }, tasks: { task }, jobs: { probe } });
