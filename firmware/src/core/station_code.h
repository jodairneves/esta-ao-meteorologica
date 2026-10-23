#pragma once

namespace wx {

/** Station code rule of the contract: 3 to 32 of a-z, 0-9 and '-', not starting or ending in '-'. */
bool isValidStationCode(const char* code);

/**
 * MQTT username of the station: the one typed in or, when empty, the station code, which is the
 * login the dashboard creates for each station (design §3.10).
 */
const char* mqttUsername(const char* user, const char* code);

}  // namespace wx
