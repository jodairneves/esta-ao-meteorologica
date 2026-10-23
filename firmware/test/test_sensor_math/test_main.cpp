#include <unity.h>

#include "core/crc.h"
#include "core/sensor_math.h"

void setUp() {}
void tearDown() {}

void test_htu21d_crc_matches_the_datasheet_examples() {
  TEST_ASSERT_EQUAL_HEX8(0x79, wx::htu21dCrc(0x00, 0xDC));
  TEST_ASSERT_EQUAL_HEX8(0x7C, wx::htu21dCrc(0x68, 0x3A));
  TEST_ASSERT_EQUAL_HEX8(0x6B, wx::htu21dCrc(0x4E, 0x85));
}

void test_htu21d_conversions() {
  // Datasheet examples: 0x683A -> 24.7 °C, 0x4E85 -> 32.3 %RH (status bits cleared).
  TEST_ASSERT_FLOAT_WITHIN(0.05f, 24.7f, wx::htu21dTemperature(0x683A));
  TEST_ASSERT_FLOAT_WITHIN(0.05f, 32.3f, wx::htu21dHumidity(0x4E85, 25.0f));
  // Compensation (datasheet): RH + (25 - T) x -0.15, so 1.5 %RH less at 15 °C.
  TEST_ASSERT_FLOAT_WITHIN(0.05f, 32.3f - 1.5f, wx::htu21dHumidity(0x4E85, 15.0f));
  TEST_ASSERT_EQUAL_FLOAT(100.0f, wx::htu21dHumidity(0xFFFC, 25.0f));
  TEST_ASSERT_EQUAL_FLOAT(0.0f, wx::htu21dHumidity(0x0000, 25.0f));
}

void test_median_ignores_a_spike() {
  const uint16_t samples[5] = {812, 815, 1023, 813, 811};
  TEST_ASSERT_EQUAL_UINT16(813, wx::median5(samples));
}

void test_battery_millivolts_from_the_adc() {
  TEST_ASSERT_EQUAL_UINT16(4200, wx::batteryMillivolts(1023, 4200));
  TEST_ASSERT_EQUAL_UINT16(3699, wx::batteryMillivolts(901, 4200));  // 3699.1 rounded
  TEST_ASSERT_EQUAL_UINT16(0, wx::batteryMillivolts(3, 4200));  // no divisor on A0
}

void test_li_ion_percent_follows_the_server_curve() {
  TEST_ASSERT_EQUAL_UINT8(100, wx::liIonPercent(4250));
  TEST_ASSERT_EQUAL_UINT8(50, wx::liIonPercent(3790));
  TEST_ASSERT_EQUAL_UINT8(0, wx::liIonPercent(3200));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_htu21d_crc_matches_the_datasheet_examples);
  RUN_TEST(test_htu21d_conversions);
  RUN_TEST(test_median_ignores_a_spike);
  RUN_TEST(test_battery_millivolts_from_the_adc);
  RUN_TEST(test_li_ion_percent_follows_the_server_curve);
  return UNITY_END();
}
