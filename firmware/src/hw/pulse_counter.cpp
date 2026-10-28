#include "pulse_counter.h"

#include "core/pulse_filter.h"
#include "pins.h"

namespace wx {

namespace {

// The filters of the reference projects (docs/hardware.md): the anemometer counts a falling edge
// after 10 ms without edges (ESPHome's pulse_counter), the rain gauge a level that lasts 10 ms (the
// reference rain gauge's delayed_on/delayed_off). Mains hum flips a pin every ~8 ms, so it gets
// through neither; the anemometer still counts up to ~70 Hz, about 30 m/s on the reference model.
constexpr uint32_t kWindQuietUs = 10'000;
constexpr uint32_t kRainStableUs = 10'000;

QuietEdgeFilter windFilter(kWindQuietUs);
StableLevelFilter rainFilter(kRainStableUs);
volatile RainEdge rainEdge = RainEdge::Change;

volatile uint32_t windCount = 0;
volatile uint32_t rainCount = 0;

void IRAM_ATTR onWindEdge() {
  if (windFilter.onEdge(GPIP(pins::kAnemometer), micros())) windCount = windCount + 1;
}

void IRAM_ATTR onRainEdge() {
  if (isRainTip(rainFilter.onEdge(GPIP(pins::kRain), micros()), rainEdge)) {
    rainCount = rainCount + 1;
  }
}

uint32_t atomicRead(const volatile uint32_t& value) {
  noInterrupts();
  const uint32_t copy = value;
  interrupts();
  return copy;
}

}  // namespace

void PulseCounters::begin(RainEdge edge) {
  pinMode(pins::kAnemometer, INPUT_PULLUP);
  pinMode(pins::kRain, INPUT_PULLUP);
  lastWind_ = atomicRead(windCount);
  rainEdge = edge;
  windFilter.reset(digitalRead(pins::kAnemometer) == HIGH, micros());
  rainFilter.reset(digitalRead(pins::kRain) == HIGH, micros());
  attachInterrupt(digitalPinToInterrupt(pins::kAnemometer), onWindEdge, CHANGE);
  attachInterrupt(digitalPinToInterrupt(pins::kRain), onRainEdge, CHANGE);
}

void PulseCounters::setRainEdge(RainEdge edge) { rainEdge = edge; }

void PulseCounters::service() {
  noInterrupts();
  if (isRainTip(rainFilter.service(micros()), rainEdge)) rainCount = rainCount + 1;
  interrupts();
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
