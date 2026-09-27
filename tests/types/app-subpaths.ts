import * as agents from "@relkit/app/agents";
import * as app from "@relkit/app";
import * as buckets from "@relkit/app/buckets";
import * as cache from "@relkit/app/cache";
import * as config from "@relkit/app/config";
import * as events from "@relkit/app/events";
import * as eventPackage from "@relkit/events";
import * as functions from "@relkit/app/functions";
import * as jobs from "@relkit/app/jobs";
import * as legacyJobs from "@relkit/app/jobs/legacy";
import * as tasks from "@relkit/app/tasks";
import * as routes from "@relkit/app/routes";
import * as schema from "@relkit/app/schema";
import * as services from "@relkit/app/services";
import * as tools from "@relkit/app/tools";

void agents.defineAgent;
void buckets.defineBucket;
void cache.defineCache;
void config.defineApp;
void config.defineEnv;
void config.projectEnv;
void events.defineEvent;
// @ts-expect-error Effect operations are available only from @relkit/events/effect.
void events.defineEventEffect;
// @ts-expect-error The top-level application API keeps the same plain TypeScript boundary.
void app.publishEventEffect;
// @ts-expect-error The events package root is the application authoring surface.
void eventPackage.EventPublisher;
void functions.defineFunction;
void jobs.defineJob;
void legacyJobs.defineJob;
void tasks.defineTask;
void routes.defineRoute;
void schema.z;
void services.defineService;
void tools.defineTool;
