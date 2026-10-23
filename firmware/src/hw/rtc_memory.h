#pragma once

#include "core/rtc_state.h"

namespace wx {

/** Reads the state kept in the RTC user memory; false when it is missing or corrupt. */
bool loadRtcState(RtcState& state);

/** Seals (CRC) and writes the state to the RTC user memory. */
void saveRtcState(RtcState& state);

}  // namespace wx
