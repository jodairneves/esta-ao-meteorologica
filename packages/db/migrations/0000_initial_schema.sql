CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'operator')),
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"station_id" uuid,
	"type" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	CONSTRAINT "alerts_type_check" CHECK ("alerts"."type" in ('station_offline', 'sensor_stale', 'sensor_error', 'battery_low', 'battery_critical', 'data_dropped', 'collector_down')),
	CONSTRAINT "alerts_severity_check" CHECK ("alerts"."severity" in ('info', 'warning', 'critical')),
	CONSTRAINT "alerts_status_check" CHECK ("alerts"."status" in ('active', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "commands" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"station_id" uuid NOT NULL,
	"command" text NOT NULL,
	"args" jsonb,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"acked_at" timestamp with time zone,
	"result" jsonb,
	CONSTRAINT "commands_command_check" CHECK ("commands"."command" in ('reboot', 'identify', 'flush', 'health')),
	CONSTRAINT "commands_status_check" CHECK ("commands"."status" in ('sent', 'acked', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "event_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"station_id" uuid,
	"user_id" uuid,
	"details" jsonb,
	CONSTRAINT "event_logs_level_check" CHECK ("event_logs"."level" in ('debug', 'info', 'warn', 'error', 'critical')),
	CONSTRAINT "event_logs_source_check" CHECK ("event_logs"."source" in ('collector', 'dashboard', 'device')),
	CONSTRAINT "event_logs_category_check" CHECK ("event_logs"."category" in ('ingest', 'mqtt', 'station', 'sensor', 'power', 'command', 'config', 'auth', 'audit', 'system'))
);
--> statement-breakpoint
CREATE TABLE "service_heartbeats" (
	"service" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"version" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_beat_at" timestamp with time zone NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "service_heartbeats_service_check" CHECK ("service_heartbeats"."service" in ('collector', 'dashboard'))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "station_sensors" (
	"station_id" uuid NOT NULL,
	"sensor" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_value_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone,
	"detail" text,
	CONSTRAINT "station_sensors_station_id_sensor_pk" PRIMARY KEY("station_id","sensor"),
	CONSTRAINT "station_sensors_sensor_check" CHECK ("station_sensors"."sensor" in ('bme280', 'anemometer', 'rain_gauge', 'battery')),
	CONSTRAINT "station_sensors_status_check" CHECK ("station_sensors"."status" in ('unknown', 'ok', 'stale', 'error', 'not_measured', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "station_state" (
	"station_id" uuid PRIMARY KEY NOT NULL,
	"connection" text DEFAULT 'unknown' NOT NULL,
	"connection_changed_at" timestamp with time zone,
	"next_contact_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"last_reading_at" timestamp with time zone,
	"last_health_at" timestamp with time zone,
	"power_mode" text,
	"battery_mv" integer,
	"rssi" integer,
	"firmware_version" text,
	"config_applied_rev" integer,
	"rain_run" bigint,
	"rain_last_count" bigint,
	"rain_last_seq" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_state_connection_check" CHECK ("station_state"."connection" in ('unknown', 'online', 'sleeping', 'offline')),
	CONSTRAINT "station_state_power_mode_check" CHECK ("station_state"."power_mode" in ('normal', 'economy', 'survival'))
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"latitude" double precision,
	"longitude" double precision,
	"elevation_m" real,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"rain_mm_per_tip" real DEFAULT 0.64 NOT NULL,
	"wind_ms_per_hz" real DEFAULT 0.42 NOT NULL,
	"temp_offset_c" real DEFAULT 0 NOT NULL,
	"hum_offset_pct" real DEFAULT 0 NOT NULL,
	"pres_offset_hpa" real DEFAULT 0 NOT NULL,
	"device_config" jsonb NOT NULL,
	"device_config_rev" integer DEFAULT 1 NOT NULL,
	"mqtt_credentials_set_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stations_code_unique" UNIQUE("code"),
	CONSTRAINT "stations_code_format_check" CHECK ("stations"."code" ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
	CONSTRAINT "stations_latitude_check" CHECK ("stations"."latitude" between -90 and 90),
	CONSTRAINT "stations_longitude_check" CHECK ("stations"."longitude" between -180 and 180),
	CONSTRAINT "stations_rain_factor_check" CHECK ("stations"."rain_mm_per_tip" > 0),
	CONSTRAINT "stations_wind_factor_check" CHECK ("stations"."wind_ms_per_hz" > 0),
	CONSTRAINT "stations_device_config_rev_check" CHECK ("stations"."device_config_rev" >= 1)
);
--> statement-breakpoint
CREATE TABLE "device_health" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "device_health_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"station_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firmware_version" text,
	"power_mode" text,
	"reset_reason" text,
	"battery_mv" integer,
	"rssi" integer,
	"heap_free" integer,
	"heap_frag" integer,
	"wifi_reconnects" integer,
	"mqtt_reconnects" integer,
	"buffered" integer,
	"dropped" integer,
	"uptime_s" bigint,
	"sensors" jsonb
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "readings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"station_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run" bigint NOT NULL,
	"seq" bigint NOT NULL,
	"interval_s" integer NOT NULL,
	"temperature_c" real,
	"humidity_pct" real,
	"pressure_hpa" real,
	"pressure_msl_hpa" real,
	"altitude_m" real,
	"dew_point_c" real,
	"wind_speed_ms" real,
	"wind_gust_ms" real,
	"rain_mm" real,
	"wind_pulses" integer,
	"gust_pulses" integer,
	"rain_count" bigint
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_sensors" ADD CONSTRAINT "station_sensors_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_state" ADD CONSTRAINT "station_state_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_health" ADD CONSTRAINT "device_health_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_active_station_condition_uq" ON "alerts" USING btree ("station_id","type","subject") WHERE status = 'active' and station_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_active_system_condition_uq" ON "alerts" USING btree ("type","subject") WHERE status = 'active' and station_id is null;--> statement-breakpoint
CREATE INDEX "alerts_status_started_idx" ON "alerts" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "alerts_station_started_idx" ON "alerts" USING btree ("station_id","started_at");--> statement-breakpoint
CREATE INDEX "commands_station_created_idx" ON "commands" USING btree ("station_id","created_at");--> statement-breakpoint
CREATE INDEX "event_logs_ts_idx" ON "event_logs" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "event_logs_station_ts_idx" ON "event_logs" USING btree ("station_id","ts");--> statement-breakpoint
CREATE INDEX "event_logs_level_ts_idx" ON "event_logs" USING btree ("level","ts");--> statement-breakpoint
CREATE INDEX "device_health_station_ts_idx" ON "device_health" USING btree ("station_id","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "readings_station_run_seq_uq" ON "readings" USING btree ("station_id","run","seq");--> statement-breakpoint
CREATE INDEX "readings_station_ts_idx" ON "readings" USING btree ("station_id","ts");