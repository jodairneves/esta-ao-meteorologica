#include "rtc_memory.h"

#include <Arduino.h>

namespace wx {

bool loadRtcState(RtcState& state) {
  if (!ESP.rtcUserMemoryRead(0, reinterpret_cast<uint32_t*>(&state), sizeof(state))) return false;
  return isValid(state);
}

void saveRtcState(RtcState& state) {
  seal(state);
  ESP.rtcUserMemoryWrite(0, reinterpret_cast<uint32_t*>(&state), sizeof(state));
}

}  // namespace wx
