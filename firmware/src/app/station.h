#pragma once

namespace wx {

/**
 * The station application (design §4): measuring intervals aligned to the clock, the three
 * power profiles, the MQTT session and the remote configuration and commands.
 */
void stationSetup();
void stationLoop();

}  // namespace wx
