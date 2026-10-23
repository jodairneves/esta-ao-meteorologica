#include "battery.h"

#include "core/sensor_math.h"

namespace wx {

uint16_t readBatteryMillivolts(uint16_t fullScaleMv) {
  uint16_t samples[5];
  for (uint16_t& sample : samples) {
    sample = static_cast<uint16_t>(analogRead(A0));
    delay(2);
  }
  return batteryMillivolts(median5(samples), fullScaleMv);
}

}  // namespace wx
