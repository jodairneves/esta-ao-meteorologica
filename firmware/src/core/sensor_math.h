#pragma once

#include <cstdint>

namespace wx {

// Conversions of raw sensor and ADC values, kept apart from the I2C/ADC drivers so they are
// unit tested on the host.

/** HTU21D temperature (°C) from the 16-bit raw value (status bits are cleared). */
float htu21dTemperature(uint16_t raw);

/**
 * HTU21D relative humidity (%) from the raw value, with the datasheet temperature
 * compensation (-0.15 %RH/°C away from 25 °C) and clamped to 0–100.
 */
float htu21dHumidity(uint16_t raw, float temperatureC);

/** Median of five samples (sorts a copy). */
uint16_t median5(const uint16_t samples[5]);

/**
 * Battery millivolts from the 10-bit A0 reading. `fullScaleMv` is the voltage that reads as
 * 1023 (100 kOhm in series with the D1 mini divider gives about 4200 mV). Returns 0 (no battery
 * divisor) when the pin reads near zero.
 */
uint16_t batteryMillivolts(uint16_t adc, uint16_t fullScaleMv);

/** Li-ion state of charge (0–100 %) from the resting voltage, for logs only. */
uint8_t liIonPercent(uint16_t millivolts);

}  // namespace wx
