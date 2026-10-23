#pragma once

#include <Arduino.h>

#include "core/types.h"

namespace wx {

/**
 * Interrupt-driven pulse counters (design §4.2): the anemometer on the falling edge with a 2 ms
 * debounce (up to 500 Hz), the rain gauge on every change or only on the falling edge, with a
 * 50 ms debounce.
 */
class PulseCounters {
 public:
  void begin(RainEdge rainEdge);
  void setRainEdge(RainEdge rainEdge);
  void end();

  /** Anemometer pulses since the last call. */
  uint32_t takeWindPulses();
  /** Rain gauge tips counted since begin(). */
  uint32_t rainPulses() const;

 private:
  uint32_t lastWind_ = 0;
};

}  // namespace wx
