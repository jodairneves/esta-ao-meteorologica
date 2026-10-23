#pragma once

#include <Arduino.h>

namespace wx {

/** On-board LED (D4, active low). Off by default; blinks to identify the station. */
class StatusLed {
 public:
  void begin();
  /** Blinks for `durationMs` (command `identify`). */
  void identify(uint32_t durationMs);
  void loop();

 private:
  void set(bool on);
  uint32_t until_ = 0;
  bool active_ = false;
};

}  // namespace wx
