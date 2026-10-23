#include "gust.h"

namespace wx {

void GustTracker::addSecond(uint32_t pulses) {
  window_[next_] = pulses;
  next_ = static_cast<uint8_t>((next_ + 1) % 3);
  total_ += pulses;
  const uint32_t sum = window_[0] + window_[1] + window_[2];
  if (sum > gust_) gust_ = sum;
}

void GustTracker::reset() {
  window_[0] = window_[1] = window_[2] = 0;
  next_ = 0;
  total_ = 0;
  gust_ = 0;
}

}  // namespace wx
