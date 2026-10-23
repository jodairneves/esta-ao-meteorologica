#pragma once

#include <cstdint>

namespace wx {

/**
 * Wind pulses of one measuring interval and its gust: the highest sum of pulses over any
 * 3-second window (WMO 3 s gust), fed once per second.
 *
 * The window restarts with each interval, so the gust never exceeds the interval's pulses
 * (the contract requires gust_p <= wind_p).
 */
class GustTracker {
 public:
  /** Pulses counted during the last second. */
  void addSecond(uint32_t pulses);

  /** Starts a new interval: total, gust and the rolling window go back to zero. */
  void reset();

  uint32_t total() const { return total_; }
  uint32_t gust() const { return gust_; }

 private:
  uint32_t window_[3] = {0, 0, 0};
  uint8_t next_ = 0;
  uint32_t total_ = 0;
  uint32_t gust_ = 0;
};

}  // namespace wx
