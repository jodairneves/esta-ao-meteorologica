#pragma once

#include "settings_store.h"

namespace wx {

/**
 * Configuration portal (design §4.5): an access point "Estacao-XXXXXX", protected by the
 * PORTAL_PASSWORD build flag, asking for the Wi-Fi network and the MQTT host, port, TLS,
 * station code and password. Blocks until five minutes go by without use; saving without the
 * server fields opens it again.
 *
 * Returns true when the station got online with complete settings (saved to flash). A portal
 * that times out changes nothing.
 */
bool runConfigPortal(MqttSettings& settings);

/** Access point name of this board. */
String portalName();

/** Password of the configuration access point (PORTAL_PASSWORD build flag). */
const char* portalPassword();

}  // namespace wx
