CREATE TABLE `memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organizationId` text NOT NULL,
	`userId` integer NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`email` text NOT NULL UNIQUE,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_identity` ON `memberships` (`organizationId`,`userId`);