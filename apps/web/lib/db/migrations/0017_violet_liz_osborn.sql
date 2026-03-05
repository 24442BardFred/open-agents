CREATE TABLE "team_members" (
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"personal_owner_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "team_id" text;
--> statement-breakpoint
INSERT INTO "teams" (
	"id",
	"name",
	"personal_owner_user_id",
	"created_at",
	"updated_at"
)
SELECT
	'personal_' || "id",
	CASE
		WHEN NULLIF(BTRIM("username"), '') IS NULL THEN 'My Team'
		ELSE "username" || '''s Team'
	END,
	"id",
	now(),
	now()
FROM "users"
ON CONFLICT ("id") DO UPDATE
SET
	"personal_owner_user_id" = EXCLUDED."personal_owner_user_id",
	"updated_at" = now();
--> statement-breakpoint
INSERT INTO "team_members" (
	"team_id",
	"user_id",
	"role",
	"created_at",
	"updated_at"
)
SELECT
	'personal_' || "id",
	"id",
	'owner',
	now(),
	now()
FROM "users"
ON CONFLICT ("team_id", "user_id") DO UPDATE
SET
	"role" = 'owner',
	"updated_at" = now();
--> statement-breakpoint
UPDATE "sessions"
SET "team_id" = 'personal_' || "user_id"
WHERE "team_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "team_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_personal_owner_user_id_users_id_fk" FOREIGN KEY ("personal_owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "team_members_user_id_idx" ON "team_members" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "teams_personal_owner_user_id_idx" ON "teams" USING btree ("personal_owner_user_id");
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sessions_team_id_idx" ON "sessions" USING btree ("team_id");
