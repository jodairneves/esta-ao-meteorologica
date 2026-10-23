DROP INDEX "device_health_station_ts_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "device_health_station_ts_uq" ON "device_health" USING btree ("station_id","ts");