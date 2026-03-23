CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"google_access_token" text NOT NULL,
	"google_refresh_token" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "buckets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enriched_description" text,
	"boundary_notes" text,
	"color" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "buckets_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "category_exemplars" (
	"id" serial PRIMARY KEY NOT NULL,
	"bucket_id" integer NOT NULL,
	"embedding" vector(384) NOT NULL,
	"source" text NOT NULL,
	"weight" real DEFAULT 0.5 NOT NULL,
	"source_thread_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"thread_id" text NOT NULL,
	"bucket_id" integer,
	"subject" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text NOT NULL,
	"snippet" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"message_count" integer NOT NULL,
	"is_participant" boolean NOT NULL,
	"gmail_category" text,
	"attachment_filenames" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_unread" boolean NOT NULL,
	"embedding" vector(384),
	"umap_x" real,
	"umap_y" real,
	"classification_tier" integer,
	"confidence" real,
	"llm_reasoning" text,
	"security_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"urgency_score" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "classifications_user_thread_unique" UNIQUE("user_id","thread_id")
);
--> statement-breakpoint
CREATE TABLE "reclassification_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"classification_id" integer NOT NULL,
	"from_bucket_id" integer NOT NULL,
	"to_bucket_id" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer,
	"estimated_cost" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_exemplars" ADD CONSTRAINT "category_exemplars_bucket_id_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."buckets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_bucket_id_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."buckets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassification_log" ADD CONSTRAINT "reclassification_log_classification_id_classifications_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."classifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassification_log" ADD CONSTRAINT "reclassification_log_from_bucket_id_buckets_id_fk" FOREIGN KEY ("from_bucket_id") REFERENCES "public"."buckets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclassification_log" ADD CONSTRAINT "reclassification_log_to_bucket_id_buckets_id_fk" FOREIGN KEY ("to_bucket_id") REFERENCES "public"."buckets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_exemplars_bucket_id_idx" ON "category_exemplars" USING btree ("bucket_id");--> statement-breakpoint
CREATE INDEX "classifications_embedding_idx" ON "classifications" USING btree ("embedding");--> statement-breakpoint
CREATE INDEX "ai_usage_user_created_at_idx" ON "ai_usage" USING btree ("user_id","created_at");