#pragma once

#include <Arduino.h>

// Wiring of the D1 mini (design §4.1).
namespace wx::pins {

constexpr uint8_t kSda = 4;          // D2: BME280 or HTU21D SDA
constexpr uint8_t kScl = 5;          // D1: BME280 or HTU21D SCL
constexpr uint8_t kRain = 14;        // D5: rain gauge (reed or Hall), INPUT_PULLUP
constexpr uint8_t kAnemometer = 12;  // D6: anemometer (reed or Hall), INPUT_PULLUP
constexpr uint8_t kLed = 2;          // D4: on-board LED, active low
// D0 (GPIO16) must be wired to RST so the timer can wake the board from deep sleep.

}  // namespace wx::pins
