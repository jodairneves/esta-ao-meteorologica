#pragma once

#include <Arduino.h>

#include "core/device_config.h"
#include "core/station_code.h"

namespace wx {

/** Connection settings typed in the configuration portal (design §4.5). */
struct MqttSettings {
  char host[64] = {0};
  uint16_t port = 8883;
  bool tls = true;
  /** Station code: MQTT username and topic segment. */
  char code[33] = {0};
  char password[65] = {0};

  bool complete() const;
};


bool mountStorage();
bool loadMqttSettings(MqttSettings& settings);
bool saveMqttSettings(const MqttSettings& settings);

/** The configuration last applied (rev 0 and defaults when there is none yet). */
bool loadDeviceConfig(DeviceConfig& config, uint32_t& rev);
bool saveDeviceConfig(const DeviceConfig& config, uint32_t rev);
/** Back to the defaults and rev 0: the retained configuration arrives again on connecting. */
void forgetDeviceConfig();

}  // namespace wx
