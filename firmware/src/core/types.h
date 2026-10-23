#pragma once

// Shared vocabulary of the firmware. Everything under src/core is free of Arduino and hardware
// calls, so it builds and is unit tested on the host (pio test -e native).

#include <cmath>
#include <cstdint>

namespace wx {

/** Running power profile (design §4.3). */
enum class PowerMode : uint8_t { Normal = 0, Economy = 1, Survival = 2 };

/** Profile selection from the server configuration: `auto` follows the battery. */
enum class PowerConfigMode : uint8_t { Auto = 0, Normal = 1, Economy = 2 };

/** How the rain gauge input is counted. */
enum class RainEdge : uint8_t { Change = 0, Falling = 1 };

/** Temperature/humidity sensor found on the I2C bus: it defines the station version. */
enum class ClimateSensor : uint8_t { None = 0, Bme280 = 1, Htu21d = 2 };

/** Sensor states reported in `health.sensors`. */
enum class SensorHealth : uint8_t { Ok = 0, Error = 1, Absent = 2, Disabled = 3 };

const char* powerModeName(PowerMode mode);
const char* sensorHealthName(SensorHealth health);
const char* climateSensorName(ClimateSensor sensor);

/** "Not measured" for counters; floats use NaN (never 0: design rule). */
constexpr uint32_t kNoCount = 0xFFFFFFFFu;

inline bool hasValue(float value) { return !std::isnan(value); }
inline bool hasValue(uint32_t count) { return count != kNoCount; }

}  // namespace wx
