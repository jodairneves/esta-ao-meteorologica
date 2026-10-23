#pragma once

#include <cstddef>
#include <cstdint>

#include "reading_buffer.h"
#include "types.h"

namespace wx {

// JSON messages of the MQTT contract v1 (design §3). Every builder writes into a caller buffer
// and returns the length (0 when it did not fit).

/** Most readings per telemetry message (design §4.4). */
constexpr size_t kMaxBatch = 30;

struct TelemetryBatch {
  size_t length = 0;
  /** How many readings from the front of the buffer the message carries. */
  size_t readings = 0;
};

/**
 * `telemetry` with the oldest readings, up to kMaxBatch and as many as fit in `capacity`.
 * Readings without a timestamp are never sent.
 */
TelemetryBatch writeTelemetry(const ReadingBuffer& buffer, uint32_t run, char* out, size_t capacity);

enum class LinkState : uint8_t { Online, Sleeping };

struct StatusInfo {
  LinkState state = LinkState::Online;
  uint32_t ts = 0;
  PowerMode mode = PowerMode::Normal;
  /** Next contact when sleeping, Unix seconds (0 = none). */
  uint32_t next = 0;
  const char* fw = "";
};

size_t writeStatus(const StatusInfo& status, char* out, size_t capacity);

/** The retained LWT published by the broker when the connection drops without notice. */
constexpr const char* kOfflineStatus = "{\"v\":1,\"state\":\"offline\"}";

struct HealthInfo {
  uint32_t ts = 0;
  const char* fw = "";
  PowerMode mode = PowerMode::Normal;
  /** Battery millivolts; 0 = no divisor on A0 (sent as null). */
  uint16_t batteryMv = 0;
  /** RSSI in dBm; 0 = unknown (sent as null). */
  int8_t rssi = 0;
  uint32_t heap = 0;
  uint8_t heapFrag = 0;
  uint32_t uptimeS = 0;
  const char* reset = nullptr;
  uint16_t wifiReconnects = 0;
  uint16_t mqttReconnects = 0;
  uint16_t buffered = 0;
  uint32_t dropped = 0;
  /** The climate sensor found on the bus (None when neither answered). */
  ClimateSensor climate = ClimateSensor::None;
  SensorHealth climateHealth = SensorHealth::Absent;
  /** Configuration revision applied (0 = none yet, sent as null). */
  uint32_t cfgRev = 0;
  /** Address on the local network (null when not connected), where the local page answers. */
  const char* ip = nullptr;
};

size_t writeHealth(const HealthInfo& health, char* out, size_t capacity);

enum class EventLevel : uint8_t { Debug, Info, Warn, Error };

/**
 * `event` without data, or with the data object given as a JSON text (for example
 * "{\"rev\":3}"); `ts` 0 is sent as null (clock not set).
 */
size_t writeEvent(EventLevel level, const char* code, const char* message, const char* dataJson,
                  uint32_t ts, char* out, size_t capacity);

}  // namespace wx
