#pragma once

#include <cstddef>
#include <cstdint>

#include "reading.h"

namespace wx {

/**
 * Readings waiting to be sent (design §4.4): a ring that drops the oldest when full. A reading
 * only leaves the buffer after the broker acknowledged the message that carried it (PUBACK).
 */
class ReadingBuffer {
 public:
  static constexpr size_t kCapacity = 120;  // ~2 h at one reading per minute

  /** Adds a reading; returns true when the oldest one had to be dropped to make room. */
  bool push(const Reading& reading);

  /** Oldest first. */
  const Reading& at(size_t index) const;
  size_t size() const { return count_; }
  bool empty() const { return count_ == 0; }

  /** Removes the `n` oldest readings (they were acknowledged by the broker). */
  void dropFront(size_t n);

  /** Readings dropped because the buffer was full, since boot. */
  uint32_t overflowed() const { return overflowed_; }

  /**
   * Dates the readings taken before the clock was set: ts = now - (elapsed millis since the
   * reading). Called as soon as NTP provides the time.
   */
  void fixTimestamps(uint32_t nowEpoch, uint32_t nowMs);

  /** True when the oldest reading still has no timestamp (nothing can be sent yet). */
  bool frontUndated() const { return count_ > 0 && at(0).ts == 0; }

 private:
  Reading items_[kCapacity];
  size_t head_ = 0;
  size_t count_ = 0;
  uint32_t overflowed_ = 0;
};

}  // namespace wx
