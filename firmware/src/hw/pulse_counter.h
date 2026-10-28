#pragma once

#include <Arduino.h>

#include "core/types.h"

namespace wx {

/**
 * Interrupt-driven pulse counters (design §4.2), on both edges of each pin: the anemometer counts a
 * falling edge after 10 ms without edges, the rain gauge every change, or only the falls, of a
 * level that lasted 10 ms (core/pulse_filter.h).
 */
class PulseCounters {
 public:
  void begin(RainEdge edge);
  void setRainEdge(RainEdge edge);
  /** Call it often: confirms the rain gauge's last change once it has lasted 10 ms. */
  void service();
  void end();

  /** Anemometer pulses since the last call. */
  uint32_t takeWindPulses();
  /** Rain gauge tips counted since begin(). */
  uint32_t rainPulses() const;

 private:
  uint32_t lastWind_ = 0;
};

}  // namespace wx
