import * as agents from "relkit/agents";
import * as app from "relkit";
import * as buckets from "relkit/buckets";
import * as cache from "relkit/cache";
import * as config from "relkit/config";
import * as events from "relkit/events";
import * as eventPackage from "relkit/events";
import * as functions from "relkit/functions";
import * as jobs from "relkit/jobs";
import * as tasks from "relkit/tasks";
import * as routes from "relkit/routes";
import * as schema from "relkit/schema";
import * as services from "relkit/services";
import * as tools from "relkit/tools";

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
void tasks.defineTask;
void routes.defineRoute;
void schema.z;
void services.defineService;
void tools.defineTool;
