#pragma once

#include <Arduino.h>

namespace wx {

/**
 * Battery voltage on A0 (design §4.1: 100 kOhm in series with the D1 mini divider). Median of
 * five samples; 0 when there is no divisor (the pin reads near zero).
 */
uint16_t readBatteryMillivolts(uint16_t fullScaleMv);

}  // namespace wx
