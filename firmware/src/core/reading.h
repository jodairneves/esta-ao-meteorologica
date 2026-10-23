#pragma once

#include <cmath>
#include <cstdint>

#include "types.h"

namespace wx {

/**
 * One measuring interval, as sent in `telemetry.readings[]` (design §3.3). Values are raw:
 * pulses, the cumulative rain counter of the run and uncalibrated temperature, humidity and
 * pressure. Missing values are NaN (floats) or kNoCount (counters).
 */
struct Reading {
  uint32_t seq = 0;
  /** End of the interval, Unix seconds. 0 while the clock was not set yet. */
  uint32_t ts = 0;
  /** millis() at the end of the interval, to date the reading once the clock is set. */
  uint32_t endMs = 0;
  uint16_t dur = 0;
  float temp = NAN;
  float hum = NAN;
  float pres = NAN;
  uint32_t windPulses = kNoCount;
  uint32_t gustPulses = kNoCount;
  uint32_t rainCount = kNoCount;
};

}  // namespace wx
