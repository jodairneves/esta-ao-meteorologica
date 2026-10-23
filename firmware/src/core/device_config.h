#pragma once

#include <cstddef>
#include <cstdint>

#include "power_policy.h"
#include "types.h"

namespace wx {

/** Desired configuration published retained on `weather/v1/{code}/config` (design §3.7). */
struct DeviceConfig {
  uint16_t intervalS = 60;
  uint32_t healthS = 300;
  uint16_t economyBatchS = 600;
  uint16_t survivalSleepS = 1800;
  RainEdge rainEdge = RainEdge::Change;
  PowerConfigMode powerMode = PowerConfigMode::Auto;
  uint16_t economyBelowMv = 3650;
  uint16_t survivalBelowMv = 3450;
  uint16_t recoverAboveMv = 3800;
  uint16_t batFullScaleMv = 4200;
  /** Password of the local configuration page; empty until the dashboard sends one. */
  char localPassword[65] = {0};

  PowerThresholds thresholds() const { return {economyBelowMv, survivalBelowMv, recoverAboveMv}; }
};

struct ConfigParse {
  bool ok = false;
  uint32_t rev = 0;
  DeviceConfig config;
  /** Why the message was refused, in Portuguese (it ends up in the dashboard logs). */
  char reason[96] = {0};
};

/**
 * Parses and validates a config message with the same rules as the server schema
 * (packages/shared deviceConfigSchema). `rev` is read even when the rest is invalid, so the
 * station can answer CONFIG_REJECTED for that revision.
 */
ConfigParse parseConfig(const char* json, size_t length);

/** Message with the configuration and its revision, as stored in flash and on the wire. */
size_t writeConfig(const DeviceConfig& config, uint32_t rev, char* out, size_t capacity);

}  // namespace wx
