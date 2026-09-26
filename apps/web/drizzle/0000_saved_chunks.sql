CREATE TABLE "saved_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"source_text" text NOT NULL,
	"region_requested" text NOT NULL,
	"pattern" text NOT NULL,
	"surface" text NOT NULL,
	"gloss_en" text,
	"example_es" text NOT NULL,
	"example_en" text,
	"highlight" integer[],
	"register" text,
	"regions" text[] DEFAULT '{neutral}' NOT NULL,
	"confidence" text NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"feedback" smallint DEFAULT 0 NOT NULL,
	"prompt_version" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_chunks_identity" UNIQUE NULLS NOT DISTINCT("user_id","surface","example_es"),
	CONSTRAINT "saved_chunks_kind_check" CHECK ("saved_chunks"."kind" in ('chunk', 'variant')),
	CONSTRAINT "saved_chunks_register_check" CHECK ("saved_chunks"."register" in ('coloquial', 'neutral', 'formal')),
	CONSTRAINT "saved_chunks_confidence_check" CHECK ("saved_chunks"."confidence" in ('high', 'med', 'low', 'unrated')),
	CONSTRAINT "saved_chunks_feedback_check" CHECK ("saved_chunks"."feedback" in (-1, 0, 1))
);
--> statement-breakpoint
CREATE INDEX "saved_chunks_regions_idx" ON "saved_chunks" USING gin ("regions");--> statement-breakpoint
CREATE INDEX "saved_chunks_tags_idx" ON "saved_chunks" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "saved_chunks_created_idx" ON "saved_chunks" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);