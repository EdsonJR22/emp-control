CREATE TABLE `commitment_annulment_items` (
	`id` text PRIMARY KEY NOT NULL,
	`annulment_id` text NOT NULL,
	`commitment_item_id` text NOT NULL,
	`annulled_quantity` real NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`annulled_total_cents` integer NOT NULL,
	FOREIGN KEY (`annulment_id`) REFERENCES `commitment_annulments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`commitment_item_id`) REFERENCES `commitment_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commitment_annulment_items_line_unique` ON `commitment_annulment_items` (`annulment_id`,`commitment_item_id`);--> statement-breakpoint
CREATE INDEX `commitment_annulment_items_annulment_idx` ON `commitment_annulment_items` (`annulment_id`);--> statement-breakpoint
CREATE INDEX `commitment_annulment_items_commitment_item_idx` ON `commitment_annulment_items` (`commitment_item_id`);--> statement-breakpoint
CREATE TABLE `commitment_annulments` (
	`id` text PRIMARY KEY NOT NULL,
	`commitment_id` text NOT NULL,
	`type` text NOT NULL,
	`reference` text NOT NULL,
	`annulment_date` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`calculated_total_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `commitment_annulments_commitment_idx` ON `commitment_annulments` (`commitment_id`);--> statement-breakpoint
CREATE INDEX `commitment_annulments_date_idx` ON `commitment_annulments` (`annulment_date`);