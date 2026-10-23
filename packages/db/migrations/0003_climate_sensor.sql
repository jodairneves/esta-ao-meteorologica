ALTER TABLE "station_sensors" DROP CONSTRAINT "station_sensors_sensor_check";--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "climate_sensor" text DEFAULT 'bme280' NOT NULL;--> statement-breakpoint
ALTER TABLE "station_sensors" ADD CONSTRAINT "station_sensors_sensor_check" CHECK ("station_sensors"."sensor" in ('bme280', 'htu21d', 'anemometer', 'rain_gauge', 'battery'));--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_climate_sensor_check" CHECK ("stations"."climate_sensor" in ('bme280', 'htu21d'));