#include "reading_buffer.h"

namespace wx {

bool ReadingBuffer::push(const Reading& reading) {
  bool dropped = false;
  if (count_ == kCapacity) {
    head_ = (head_ + 1) % kCapacity;
    count_--;
    overflowed_++;
    dropped = true;
  }
  items_[(head_ + count_) % kCapacity] = reading;
  count_++;
  return dropped;
}

const Reading& ReadingBuffer::at(size_t index) const { return items_[(head_ + index) % kCapacity]; }

void ReadingBuffer::dropFront(size_t n) {
  if (n > count_) n = count_;
  head_ = (head_ + n) % kCapacity;
  count_ -= n;
}

void ReadingBuffer::fixTimestamps(uint32_t nowEpoch, uint32_t nowMs) {
  for (size_t i = 0; i < count_; i++) {
    Reading& reading = items_[(head_ + i) % kCapacity];
    if (reading.ts != 0) continue;
    // Unsigned subtraction also handles the millis() rollover (~49 days).
    const uint32_t ageS = (nowMs - reading.endMs) / 1000;
    reading.ts = nowEpoch > ageS ? nowEpoch - ageS : 0;
  }
}

}  // namespace wx
