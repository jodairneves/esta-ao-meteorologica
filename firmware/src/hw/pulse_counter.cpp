#include "pulse_counter.h"

#include "pins.h"

namespace wx {

namespace {

constexpr uint32_t kWindDebounceUs = 2'000;
constexpr uint32_t kRainDebounceUs = 50'000;

volatile uint32_t windCount = 0;
volatile uint32_t windLastUs = 0;
volatile uint32_t rainCount = 0;
volatile uint32_t rainLastUs = 0;

void IRAM_ATTR onWindPulse() {
  const uint32_t now = micros();
  if (now - windLastUs < kWindDebounceUs) return;
  windLastUs = now;
  windCount = windCount + 1;
}

void IRAM_ATTR onRainPulse() {
  const uint32_t now = micros();
  if (now - rainLastUs < kRainDebounceUs) return;
  rainLastUs = now;
  rainCount = rainCount + 1;
}

uint32_t atomicRead(const volatile uint32_t& value) {
  noInterrupts();
  const uint32_t copy = value;
  interrupts();
  return copy;
}

}  // namespace

void PulseCounters::begin(RainEdge rainEdge) {
  pinMode(pins::kAnemometer, INPUT_PULLUP);
  pinMode(pins::kRain, INPUT_PULLUP);
  lastWind_ = atomicRead(windCount);
  attachInterrupt(digitalPinToInterrupt(pins::kAnemometer), onWindPulse, FALLING);
  setRainEdge(rainEdge);
}

void PulseCounters::setRainEdge(RainEdge rainEdge) {
  detachInterrupt(digitalPinToInterrupt(pins::kRain));
  attachInterrupt(digitalPinToInterrupt(pins::kRain), onRainPulse,
                  rainEdge == RainEdge::Falling ? FALLING : CHANGE);
}

void PulseCounters::end() {
  detachInterrupt(digitalPinToInterrupt(pins::kAnemometer));
  detachInterrupt(digitalPinToInterrupt(pins::kRain));
}

uint32_t PulseCounters::takeWindPulses() {
  const uint32_t now = atomicRead(windCount);
  const uint32_t delta = now - lastWind_;
  lastWind_ = now;
  return delta;
}

uint32_t PulseCounters::rainPulses() const { return atomicRead(rainCount); }

}  // namespace wx
