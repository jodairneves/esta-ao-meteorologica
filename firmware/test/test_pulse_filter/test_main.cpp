#include <unity.h>

#include "core/pulse_filter.h"

using wx::LevelChange;
using wx::QuietEdgeFilter;
using wx::RainEdge;
using wx::StableLevelFilter;

void setUp() {}
void tearDown() {}

constexpr uint32_t kMs = 1000;  // the filters count microseconds
constexpr uint32_t kFilterUs = 10 * kMs;

// ---- anemometer -------------------------------------------------------------------------------

void test_wind_counts_each_clean_pulse() {
  QuietEdgeFilter filter(kFilterUs);
  uint32_t pulses = 0;
  for (uint32_t t = 100 * kMs; t < 1100 * kMs; t += 100 * kMs) {
    pulses += filter.onEdge(false, t);           // the magnet arrives
    pulses += filter.onEdge(true, t + 2 * kMs);  // and leaves
  }
  TEST_ASSERT_EQUAL_UINT32(10, pulses);
}

void test_wind_counts_a_noisy_crossing_once() {
  // A 49E without comparator crossing the switching point slowly: an edge every 0.4 ms.
  QuietEdgeFilter filter(kFilterUs);
  uint32_t pulses = 0;
  uint32_t t = 500 * kMs;
  for (int i = 0; i < 15; i++, t += 400) pulses += filter.onEdge(i % 2 == 1, t);  // ends low
  t += 30 * kMs;  // the magnet in front of the sensor
  for (int i = 0; i < 15; i++, t += 400) pulses += filter.onEdge(i % 2 == 0, t);  // ends high
  TEST_ASSERT_EQUAL_UINT32(1, pulses);
}

void test_wind_ignores_mains_hum_at_the_switching_point() {
  // The rotor stopped with a magnet at the switching point: 60 Hz hum flips the pin every 8.3 ms.
  QuietEdgeFilter filter(kFilterUs);
  uint32_t pulses = 0;
  uint32_t t = 1000 * kMs;
  for (int i = 0; i < 120; i++, t += 8333) pulses += filter.onEdge(i % 2 == 1, t);
  TEST_ASSERT_EQUAL_UINT32(1, pulses);  // only the first fall: the magnet arriving
}

void test_wind_keeps_up_with_a_fast_rotor() {
  // About 30 m/s on the reference model: 71 Hz, low for 3 ms of every 14 ms.
  QuietEdgeFilter filter(kFilterUs);
  uint32_t pulses = 0;
  uint32_t t = 1000 * kMs;
  for (int i = 0; i < 71; i++, t += 14 * kMs) {
    pulses += filter.onEdge(false, t);
    pulses += filter.onEdge(true, t + 3 * kMs);
  }
  TEST_ASSERT_EQUAL_UINT32(71, pulses);
}

void test_wind_counts_a_dip_already_over_when_read() {
  // A magnet that barely reaches the switching point: both edges of the dip raise one interrupt,
  // which reads the line high again.
  QuietEdgeFilter filter(kFilterUs);
  uint32_t pulses = 0;
  for (uint32_t t = 100 * kMs; t < 1100 * kMs; t += 100 * kMs) pulses += filter.onEdge(true, t);
  TEST_ASSERT_EQUAL_UINT32(10, pulses);
}

void test_wind_ignores_the_magnet_leaving() {
  // The rotor stopped with a magnet in front: when it leaves, the rising edge is no pulse.
  QuietEdgeFilter filter(kFilterUs);
  filter.reset(false, 0);
  TEST_ASSERT_FALSE(filter.onEdge(true, 5000 * kMs));
  TEST_ASSERT_TRUE(filter.onEdge(false, 5100 * kMs));  // the next magnet arrives
}

void test_wind_counts_a_bouncing_reed_once() {
  QuietEdgeFilter filter(kFilterUs);
  const uint32_t t = 2000 * kMs;
  uint32_t pulses = filter.onEdge(false, t);
  pulses += filter.onEdge(true, t + 200);  // contact bounce
  pulses += filter.onEdge(false, t + 450);
  TEST_ASSERT_EQUAL_UINT32(1, pulses);
}

void test_wind_survives_the_microsecond_clock_wrapping() {
  QuietEdgeFilter filter(kFilterUs);
  TEST_ASSERT_TRUE(filter.onEdge(false, 0xFFFFFFFFu - 50 * kMs));
  TEST_ASSERT_FALSE(filter.onEdge(true, 0xFFFFFFFFu - 48 * kMs));
  TEST_ASSERT_TRUE(filter.onEdge(false, 20 * kMs));  // 68 ms later, past the wrap
}

// ---- rain gauge -------------------------------------------------------------------------------

void test_rain_confirms_a_level_that_lasts_10_ms() {
  StableLevelFilter filter(kFilterUs);
  filter.reset(true, 0);
  TEST_ASSERT_EQUAL(LevelChange::None, filter.onEdge(false, 100 * kMs));
  TEST_ASSERT_EQUAL(LevelChange::None, filter.service(109 * kMs));
  TEST_ASSERT_EQUAL(LevelChange::Fell, filter.service(110 * kMs));
  TEST_ASSERT_EQUAL(LevelChange::None, filter.service(500 * kMs));  // reported once
}

void test_rain_ignores_a_glitch_shorter_than_10_ms() {
  StableLevelFilter filter(kFilterUs);
  filter.reset(true, 0);
  TEST_ASSERT_EQUAL(LevelChange::None, filter.onEdge(false, 100 * kMs));
  TEST_ASSERT_EQUAL(LevelChange::None, filter.onEdge(true, 103 * kMs));
  TEST_ASSERT_EQUAL(LevelChange::None, filter.service(300 * kMs));
}

void test_rain_ignores_symmetric_mains_hum() {
  StableLevelFilter filter(kFilterUs);
  filter.reset(true, 0);
  uint32_t changes = 0;
  uint32_t t = 100 * kMs;
  for (int i = 0; i < 120; i++, t += 8333) {
    changes += filter.onEdge(i % 2 == 1, t) != LevelChange::None;
    changes += filter.service(t + 8000) != LevelChange::None;
  }
  TEST_ASSERT_EQUAL_UINT32(0, changes);
}

void test_rain_counts_lopsided_mains_hum_once() {
  // Low 12 ms and high 4.7 ms per cycle: the low part is long enough once, the high part never.
  StableLevelFilter filter(kFilterUs);
  filter.reset(true, 0);
  uint32_t changes = 0;
  uint32_t t = 100 * kMs;
  for (int cycle = 0; cycle < 60; cycle++, t += 16667) {
    changes += filter.onEdge(false, t) != LevelChange::None;
    changes += filter.onEdge(true, t + 12 * kMs) != LevelChange::None;
  }
  TEST_ASSERT_EQUAL_UINT32(1, changes);
}

void test_rain_confirms_at_the_next_edge_when_service_is_late() {
  // A blocking publish delays service(): the next tip's edge confirms the level before it.
  StableLevelFilter filter(kFilterUs);
  filter.reset(true, 0);
  TEST_ASSERT_EQUAL(LevelChange::None, filter.onEdge(false, 100 * kMs));
  TEST_ASSERT_EQUAL(LevelChange::Fell, filter.onEdge(true, 3000 * kMs));
  TEST_ASSERT_EQUAL(LevelChange::Rose, filter.service(3010 * kMs));
}

void test_rain_starts_from_the_level_at_setup() {
  StableLevelFilter filter(kFilterUs);
  filter.reset(false, 0);  // the magnet resting in front of the sensor
  TEST_ASSERT_EQUAL(LevelChange::None, filter.service(1000 * kMs));
}

void test_rain_tip_follows_the_counting_mode() {
  TEST_ASSERT_TRUE(wx::isRainTip(LevelChange::Fell, RainEdge::Change));
  TEST_ASSERT_TRUE(wx::isRainTip(LevelChange::Rose, RainEdge::Change));
  TEST_ASSERT_TRUE(wx::isRainTip(LevelChange::Fell, RainEdge::Falling));
  TEST_ASSERT_FALSE(wx::isRainTip(LevelChange::Rose, RainEdge::Falling));
  TEST_ASSERT_FALSE(wx::isRainTip(LevelChange::None, RainEdge::Change));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_wind_counts_each_clean_pulse);
  RUN_TEST(test_wind_counts_a_noisy_crossing_once);
  RUN_TEST(test_wind_ignores_mains_hum_at_the_switching_point);
  RUN_TEST(test_wind_keeps_up_with_a_fast_rotor);
  RUN_TEST(test_wind_counts_a_dip_already_over_when_read);
  RUN_TEST(test_wind_ignores_the_magnet_leaving);
  RUN_TEST(test_wind_counts_a_bouncing_reed_once);
  RUN_TEST(test_wind_survives_the_microsecond_clock_wrapping);
  RUN_TEST(test_rain_confirms_a_level_that_lasts_10_ms);
  RUN_TEST(test_rain_ignores_a_glitch_shorter_than_10_ms);
  RUN_TEST(test_rain_ignores_symmetric_mains_hum);
  RUN_TEST(test_rain_counts_lopsided_mains_hum_once);
  RUN_TEST(test_rain_confirms_at_the_next_edge_when_service_is_late);
  RUN_TEST(test_rain_starts_from_the_level_at_setup);
  RUN_TEST(test_rain_tip_follows_the_counting_mode);
  return UNITY_END();
}
