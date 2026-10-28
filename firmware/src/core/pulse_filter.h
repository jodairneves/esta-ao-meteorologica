#pragma once

#include <cstdint>

#include "types.h"

// The pulse interrupts call these filters: always inlined, so their code lands in the ISR's IRAM.
#define WX_ISR_INLINE inline __attribute__((always_inline))

namespace wx {

/**
 * Anemometer filter, the rule of ESPHome's pulse_counter used by the reference projects: every
 * edge, counted or not, restarts the quiet time, and a pulse is the first edge after `quietUs` of
 * the line resting high. A Hall sensor crossing its switching point slowly, or mains hum (60 Hz
 * flips the pin every ~8 ms), makes a burst of edges, and a burst counts once at most.
 *
 * The level read after the edge does not decide: a magnet that barely reaches the switching point
 * dips the line for a few microseconds, and by the time the interrupt reads it, it is high again.
 */
class QuietEdgeFilter {
 public:
  explicit QuietEdgeFilter(uint32_t quietUs) : quietUs_(quietUs) {}

  /** Starts from the level at setup: a magnet resting in front of the sensor is no pulse. */
  void reset(bool high, uint32_t nowUs) {
    restedHigh_ = high;
    lastEdgeUs_ = nowUs;
  }

  /** One edge, with the level read right after it. True when it is a pulse. */
  WX_ISR_INLINE bool onEdge(bool high, uint32_t nowUs) {
    const bool pulse = restedHigh_ && nowUs - lastEdgeUs_ >= quietUs_;
    lastEdgeUs_ = nowUs;
    restedHigh_ = high;
    return pulse;
  }

 private:
  uint32_t quietUs_;
  uint32_t lastEdgeUs_ = 0;
  bool restedHigh_ = true;  // the pull-up holds an idle line high
};

/** A change of the filtered level. */
enum class LevelChange : uint8_t { None, Fell, Rose };

/**
 * Rain gauge filter, the rule of the reference rain gauge (ESPHome's delayed_on/delayed_off): a new
 * level counts only after it lasts `stableUs` without edges. Each edge confirms the level of the
 * edge before it; service() confirms the last one, which no edge follows.
 */
class StableLevelFilter {
 public:
  explicit StableLevelFilter(uint32_t stableUs) : stableUs_(stableUs) {}

  /** Starts from the level at setup: a magnet resting in front of the sensor is no tip. */
  void reset(bool high, uint32_t nowUs) {
    stable_ = high;
    pending_ = high;
    lastEdgeUs_ = nowUs;
  }

  WX_ISR_INLINE LevelChange onEdge(bool high, uint32_t nowUs) {
    const LevelChange change = confirm(nowUs);
    pending_ = high;
    lastEdgeUs_ = nowUs;
    return change;
  }

  WX_ISR_INLINE LevelChange service(uint32_t nowUs) { return confirm(nowUs); }

 private:
  WX_ISR_INLINE LevelChange confirm(uint32_t nowUs) {
    if (pending_ == stable_ || nowUs - lastEdgeUs_ < stableUs_) return LevelChange::None;
    stable_ = pending_;
    return stable_ ? LevelChange::Rose : LevelChange::Fell;
  }

  uint32_t stableUs_;
  uint32_t lastEdgeUs_ = 0;
  bool stable_ = true;
  bool pending_ = true;
};

/** Whether a confirmed change is a tip: every change, or only the falls (RainEdge::Falling). */
WX_ISR_INLINE bool isRainTip(LevelChange change, RainEdge edge) {
  if (change == LevelChange::None) return false;
  return edge == RainEdge::Change || change == LevelChange::Fell;
}

}  // namespace wx
