#include "sensor_math.h"

#include <algorithm>
#include <cstddef>

namespace wx {

float htu21dTemperature(uint16_t raw) {
  const float value = static_cast<float>(raw & 0xFFFC);
  return -46.85f + 175.72f * value / 65536.0f;
}

float htu21dHumidity(uint16_t raw, float temperatureC) {
  const float value = static_cast<float>(raw & 0xFFFC);
  float humidity = -6.0f + 125.0f * value / 65536.0f;
  humidity += (25.0f - temperatureC) * -0.15f;
  return std::min(100.0f, std::max(0.0f, humidity));
}

uint16_t median5(const uint16_t samples[5]) {
  uint16_t sorted[5];
  std::copy(samples, samples + 5, sorted);
  std::sort(sorted, sorted + 5);
  return sorted[2];
}

uint16_t batteryMillivolts(uint16_t adc, uint16_t fullScaleMv) {
  const uint32_t millivolts = (static_cast<uint32_t>(adc) * fullScaleMv + 511) / 1023;
  // Without the divisor A0 picks up noise, sometimes a few hundred millivolts.
  return millivolts < kMinBatteryMv ? 0 : static_cast<uint16_t>(millivolts);
}

uint8_t liIonPercent(uint16_t millivolts) {
  // Same resting-voltage curve as packages/shared (meteo/battery.ts).
  static const uint16_t kCurve[][2] = {{3300, 0},  {3500, 5},  {3610, 10}, {3670, 20},
                                       {3710, 30}, {3750, 40}, {3790, 50}, {3850, 60},
                                       {3920, 70}, {4000, 80}, {4100, 90}, {4200, 100}};
  if (millivolts <= kCurve[0][0]) return 0;
  for (size_t i = 1; i < sizeof(kCurve) / sizeof(kCurve[0]); i++) {
    if (millivolts <= kCurve[i][0]) {
      const uint32_t span = kCurve[i][0] - kCurve[i - 1][0];
      const uint32_t offset = millivolts - kCurve[i - 1][0];
      // Rounded like the server (Math.round), so the station and the dashboard agree.
      const uint32_t delta = kCurve[i][1] - kCurve[i - 1][1];
      return static_cast<uint8_t>(kCurve[i - 1][1] + (offset * delta + span / 2) / span);
    }
  }
  return 100;
}

}  // namespace wx
