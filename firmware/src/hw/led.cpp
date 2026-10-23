#include "led.h"

#include "pins.h"

namespace wx {

void StatusLed::begin() {
  pinMode(pins::kLed, OUTPUT);
  set(false);
}

void StatusLed::identify(uint32_t durationMs) {
  until_ = millis() + durationMs;
  active_ = true;
}

void StatusLed::loop() {
  if (!active_) return;
  if (static_cast<int32_t>(millis() - until_) >= 0) {
    active_ = false;
    set(false);
    return;
  }
  set((millis() / 250) % 2 == 0);
}

void StatusLed::set(bool on) { digitalWrite(pins::kLed, on ? LOW : HIGH); }

}  // namespace wx
