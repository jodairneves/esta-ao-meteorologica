#pragma once

#include "settings_store.h"

namespace wx {

/**
 * Configuration portal (design §4.5): an access point "Estacao-XXXXXX", protected by the
 * PORTAL_PASSWORD build flag, asking for the Wi-Fi network and the MQTT host, port, TLS,
 * station code and password. Blocks for up to five minutes.
 *
 * Returns true when the station got online with complete settings (saved to flash).
 */
bool runConfigPortal(MqttSettings& settings);

/** Access point name of this board. */
String portalName();

}  // namespace wx
