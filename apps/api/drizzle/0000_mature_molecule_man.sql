CREATE TYPE "public"."dataset_column_type" AS ENUM('STRING', 'INTEGER', 'NUMBER', 'BOOLEAN', 'DATE', 'DATETIME');--> statement-breakpoint
CREATE TYPE "public"."dataset_origin" AS ENUM('FILE', 'GENERATED');--> statement-breakpoint
CREATE TYPE "public"."source_file_format" AS ENUM('CSV', 'XLSX');--> statement-breakpoint
CREATE TYPE "public"."widget_type" AS ENUM('LINE', 'BAR', 'STACKED_BAR', 'PIE', 'TEXT');--> statement-breakpoint
CREATE TABLE "source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_name" text NOT NULL,
	"format" "source_file_format" NOT NULL,
	"mime_type" text,
	"size" bigint NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_files_checksum_unique" UNIQUE("checksum")
);
--> statement-breakpoint
CREATE TABLE "dataset_schemas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_schemas_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "dataset_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"type" "dataset_column_type" NOT NULL,
	"nullable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "dataset_columns_schema_id_position_unique" UNIQUE("schema_id","position"),
	CONSTRAINT "dataset_columns_schema_id_key_unique" UNIQUE("schema_id","key"),
	CONSTRAINT "dataset_columns_position_nonnegative" CHECK ("dataset_columns"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_file_id" uuid,
	"schema_id" uuid NOT NULL,
	"origin" "dataset_origin" NOT NULL,
	"name" text NOT NULL,
	"sheet_name" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datasets_source_file_id_name_unique" UNIQUE("source_file_id","name"),
	CONSTRAINT "datasets_row_count_nonnegative" CHECK ("datasets"."row_count" >= 0),
	CONSTRAINT "datasets_origin_source_file_check" CHECK (
    ("datasets"."origin" = 'FILE' AND "datasets"."source_file_id" IS NOT NULL)
    OR ("datasets"."origin" = 'GENERATED' AND "datasets"."source_file_id" IS NULL)
  )
);
--> statement-breakpoint
CREATE TABLE "dataset_rows" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dataset_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"dataset_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"values" jsonb NOT NULL,
	CONSTRAINT "dataset_rows_dataset_id_row_index_unique" UNIQUE("dataset_id","row_index"),
	CONSTRAINT "dataset_rows_row_index_nonnegative" CHECK ("dataset_rows"."row_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "widget_type" NOT NULL,
	"title" text NOT NULL,
	"dataset_id" uuid,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widgets_type_dataset_check" CHECK (
    ("widgets"."type" = 'TEXT' AND "widgets"."dataset_id" IS NULL)
    OR ("widgets"."type" IN ('LINE', 'BAR', 'STACKED_BAR', 'PIE') AND "widgets"."dataset_id" IS NOT NULL)
  )
);
--> statement-breakpoint
ALTER TABLE "dataset_columns" ADD CONSTRAINT "dataset_columns_schema_id_dataset_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_source_file_id_source_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_schema_id_dataset_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."dataset_schemas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_rows" ADD CONSTRAINT "dataset_rows_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "datasets_schema_id_idx" ON "datasets" USING btree ("schema_id");--> statement-breakpoint
CREATE INDEX "widgets_dataset_id_idx" ON "widgets" USING btree ("dataset_id");