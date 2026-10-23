#include "climate_sensor.h"

#include <Wire.h>

#include <cmath>
#include <initializer_list>

#include "core/crc.h"
#include "core/sensor_math.h"
#include "pins.h"

namespace wx {

namespace {

constexpr uint8_t kHtuAddress = 0x40;
constexpr uint8_t kHtuSoftReset = 0xFE;
constexpr uint8_t kHtuReadUserRegister = 0xE7;
constexpr uint8_t kHtuTemperatureNoHold = 0xF3;
constexpr uint8_t kHtuHumidityNoHold = 0xF5;

bool htu21dPresent() {
  Wire.beginTransmission(kHtuAddress);
  Wire.write(kHtuSoftReset);
  if (Wire.endTransmission() != 0) return false;
  delay(15);
  Wire.beginTransmission(kHtuAddress);
  Wire.write(kHtuReadUserRegister);
  if (Wire.endTransmission() != 0) return false;
  return Wire.requestFrom(kHtuAddress, static_cast<uint8_t>(1)) == 1 && Wire.read() >= 0;
}

}  // namespace

ClimateSensor ClimateSensorDevice::detect() {
  Wire.begin(pins::kSda, pins::kScl);
  for (uint8_t address : {static_cast<uint8_t>(0x76), static_cast<uint8_t>(0x77)}) {
    if (bme_.begin(address, &Wire)) {
      // Bosch "weather monitoring": forced mode, oversampling x1, filter off.
      bme_.setSampling(Adafruit_BME280::MODE_FORCED, Adafruit_BME280::SAMPLING_X1,
                       Adafruit_BME280::SAMPLING_X1, Adafruit_BME280::SAMPLING_X1,
                       Adafruit_BME280::FILTER_OFF);
      kind_ = ClimateSensor::Bme280;
      return kind_;
    }
  }
  kind_ = htu21dPresent() ? ClimateSensor::Htu21d : ClimateSensor::None;
  return kind_;
}

ClimateReading ClimateSensorDevice::read() {
  switch (kind_) {
    case ClimateSensor::Bme280:
      return readBme280();
    case ClimateSensor::Htu21d:
      return readHtu21d();
    default:
      return {};
  }
}

ClimateReading ClimateSensorDevice::readBme280() {
  ClimateReading reading;
  if (!bme_.takeForcedMeasurement()) return reading;
  reading.temperatureC = bme_.readTemperature();
  reading.humidityPct = bme_.readHumidity();
  reading.pressureHpa = bme_.readPressure() / 100.0f;
  reading.ok = !std::isnan(reading.temperatureC) && !std::isnan(reading.pressureHpa);
  return reading;
}

bool ClimateSensorDevice::htu21dMeasure(uint8_t command, uint32_t waitMs, uint16_t& raw) {
  Wire.beginTransmission(kHtuAddress);
  Wire.write(command);
  if (Wire.endTransmission() != 0) return false;
  delay(waitMs);
  // "No hold master": the sensor NACKs until the conversion is done.
  for (int attempt = 0; attempt < 5; attempt++) {
    if (Wire.requestFrom(kHtuAddress, static_cast<uint8_t>(3)) == 3) {
      const uint8_t msb = Wire.read();
      const uint8_t lsb = Wire.read();
      const uint8_t crc = Wire.read();
      if (htu21dCrc(msb, lsb) != crc) return false;
      raw = static_cast<uint16_t>((msb << 8) | lsb);
      return true;
    }
    delay(10);
  }
  return false;
}

ClimateReading ClimateSensorDevice::readHtu21d() {
  ClimateReading reading;
  uint16_t rawTemperature = 0;
  uint16_t rawHumidity = 0;
  // 14-bit temperature takes up to 50 ms, 12-bit humidity up to 16 ms (datasheet).
  if (!htu21dMeasure(kHtuTemperatureNoHold, 50, rawTemperature)) return reading;
  if (!htu21dMeasure(kHtuHumidityNoHold, 16, rawHumidity)) return reading;
  reading.temperatureC = htu21dTemperature(rawTemperature);
  reading.humidityPct = htu21dHumidity(rawHumidity, reading.temperatureC);
  reading.ok = true;
  return reading;
}

}  // namespace wx
