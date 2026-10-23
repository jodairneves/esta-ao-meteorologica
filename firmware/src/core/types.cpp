#include "types.h"

namespace wx {

const char* powerModeName(PowerMode mode) {
  switch (mode) {
    case PowerMode::Economy:
      return "economy";
    case PowerMode::Survival:
      return "survival";
    default:
      return "normal";
  }
}

const char* sensorHealthName(SensorHealth health) {
  switch (health) {
    case SensorHealth::Error:
      return "error";
    case SensorHealth::Absent:
      return "absent";
    case SensorHealth::Disabled:
      return "disabled";
    default:
      return "ok";
  }
}

const char* climateSensorName(ClimateSensor sensor) {
  switch (sensor) {
    case ClimateSensor::Bme280:
      return "bme280";
    case ClimateSensor::Htu21d:
      return "htu21d";
    default:
      return "none";
  }
}

}  // namespace wx
