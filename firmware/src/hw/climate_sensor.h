#pragma once

#include <Arduino.h>
#include <Adafruit_BME280.h>

#include "core/types.h"

namespace wx {

struct ClimateReading {
  bool ok = false;
  float temperatureC = NAN;
  float humidityPct = NAN;
  /** NaN on the HTU21D version (no barometer). */
  float pressureHpa = NAN;
};

/**
 * The temperature/humidity sensor of the station version, found on the I2C bus at start-up:
 * BME280 at 0x76/0x77 (temperature, humidity and pressure) or HTU21D at 0x40 (no pressure).
 */
class ClimateSensorDevice {
 public:
  /** Probes the bus; returns which sensor answered (None when neither did). */
  ClimateSensor detect();
  ClimateSensor kind() const { return kind_; }

  /** One measurement at the end of the interval (forced mode on the BME280). */
  ClimateReading read();

 private:
  ClimateReading readBme280();
  ClimateReading readHtu21d();
  bool htu21dMeasure(uint8_t command, uint32_t waitMs, uint16_t& raw);

  ClimateSensor kind_ = ClimateSensor::None;
  Adafruit_BME280 bme_;
};

}  // namespace wx
