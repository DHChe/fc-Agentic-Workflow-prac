CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"status" text NOT NULL,
	"failure_reason" text,
	"original_url" text NOT NULL,
	"original_mime" text NOT NULL,
	"page_count" integer,
	"model_used" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"status" text NOT NULL,
	"content_md" text,
	"model_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"transacted_at" timestamp with time zone NOT NULL,
	"date_estimated" boolean DEFAULT false NOT NULL,
	"merchant_name" text,
	"total_amount" bigint,
	"card_last4" text,
	"category" text NOT NULL,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"duplicate_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_duplicate_of_transactions_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_user_id_uploaded_at_index" ON "documents" USING btree ("user_id","uploaded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_user_id_created_at_index" ON "reports" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_user_id_transacted_at_index" ON "transactions" USING btree ("user_id","transacted_at");--> statement-breakpoint
CREATE INDEX "usage_log_user_id_created_at_index" ON "usage_log" USING btree ("user_id","created_at");