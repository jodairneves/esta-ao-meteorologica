#include <unity.h>

#include "core/power_policy.h"

using wx::PowerConfigMode;
using wx::PowerMode;
using wx::PowerPolicy;
using wx::PowerThresholds;

static const PowerThresholds kThresholds{3650, 3450, 3800};

void setUp() {}
void tearDown() {}

void test_boot_mode_comes_straight_from_the_thresholds() {
  TEST_ASSERT_EQUAL(PowerMode::Survival, wx::bootPowerMode(3400, PowerConfigMode::Auto, kThresholds));
  TEST_ASSERT_EQUAL(PowerMode::Economy, wx::bootPowerMode(3600, PowerConfigMode::Auto, kThresholds));
  TEST_ASSERT_EQUAL(PowerMode::Normal, wx::bootPowerMode(3700, PowerConfigMode::Auto, kThresholds));
  TEST_ASSERT_EQUAL(PowerMode::Normal, wx::bootPowerMode(wx::kNoBattery, PowerConfigMode::Auto, kThresholds));
  TEST_ASSERT_EQUAL(PowerMode::Economy, wx::bootPowerMode(4100, PowerConfigMode::Economy, kThresholds));
}

void test_switching_needs_three_consecutive_measurements() {
  PowerPolicy policy(PowerMode::Normal);
  TEST_ASSERT_FALSE(policy.update(3600, PowerConfigMode::Auto, kThresholds));
  TEST_ASSERT_FALSE(policy.update(3600, PowerConfigMode::Auto, kThresholds));
  TEST_ASSERT_TRUE(policy.update(3600, PowerConfigMode::Auto, kThresholds));
  TEST_ASSERT_EQUAL(PowerMode::Economy, policy.mode());
}

void test_a_good_reading_in_between_restarts_the_count() {
  PowerPolicy policy(PowerMode::Normal);
  policy.update(3600, PowerConfigMode::Auto, kThresholds);
  policy.update(3600, PowerConfigMode::Auto, kThresholds);
  policy.update(3700, PowerConfigMode::Auto, kThresholds);  // back above the threshold
  policy.update(3600, PowerConfigMode::Auto, kThresholds);
  TEST_ASSERT_EQUAL(PowerMode::Normal, policy.mode());
}

void test_economy_returns_to_normal_only_from_the_recovery_threshold() {
  PowerPolicy policy(PowerMode::Economy);
  for (int i = 0; i < 5; i++) policy.update(3700, PowerConfigMode::Auto, kThresholds);
  TEST_ASSERT_EQUAL(PowerMode::Economy, policy.mode());
  for (int i = 0; i < 3; i++) policy.update(3810, PowerConfigMode::Auto, kThresholds);
  TEST_ASSERT_EQUAL(PowerMode::Normal, policy.mode());
}

void test_survival_skips_economy_on_the_way_back() {
  PowerPolicy policy(PowerMode::Survival);
  for (int i = 0; i < 5; i++) policy.update(3600, PowerConfigMode::Auto, kThresholds);
  TEST_ASSERT_EQUAL(PowerMode::Survival, policy.mode());
  for (int i = 0; i < 3; i++) policy.update(3850, PowerConfigMode::Auto, kThresholds);
  TEST_ASSERT_EQUAL(PowerMode::Normal, policy.mode());
}

void test_the_streak_survives_deep_sleep() {
  PowerPolicy before(PowerMode::Survival);
  before.update(3850, PowerConfigMode::Auto, kThresholds);
  before.update(3850, PowerConfigMode::Auto, kThresholds);
  // Restored from RTC memory after waking up.
  PowerPolicy after(before.mode(), before.candidate(), before.streak());
  TEST_ASSERT_TRUE(after.update(3850, PowerConfigMode::Auto, kThresholds));
  TEST_ASSERT_EQUAL(PowerMode::Normal, after.mode());
}

void test_fixed_profiles_apply_at_once_and_ignore_the_battery() {
  PowerPolicy policy(PowerMode::Normal);
  TEST_ASSERT_TRUE(policy.update(4100, PowerConfigMode::Economy, kThresholds));
  TEST_ASSERT_EQUAL(PowerMode::Economy, policy.mode());
  TEST_ASSERT_FALSE(policy.update(wx::kNoBattery, PowerConfigMode::Economy, kThresholds));
  TEST_ASSERT_TRUE(policy.update(3300, PowerConfigMode::Normal, kThresholds));
  TEST_ASSERT_EQUAL(PowerMode::Normal, policy.mode());
}

void test_auto_without_a_battery_reading_keeps_the_profile() {
  PowerPolicy policy(PowerMode::Normal);
  for (int i = 0; i < 5; i++) policy.update(wx::kNoBattery, PowerConfigMode::Auto, kThresholds);
  TEST_ASSERT_EQUAL(PowerMode::Normal, policy.mode());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_boot_mode_comes_straight_from_the_thresholds);
  RUN_TEST(test_switching_needs_three_consecutive_measurements);
  RUN_TEST(test_a_good_reading_in_between_restarts_the_count);
  RUN_TEST(test_economy_returns_to_normal_only_from_the_recovery_threshold);
  RUN_TEST(test_survival_skips_economy_on_the_way_back);
  RUN_TEST(test_the_streak_survives_deep_sleep);
  RUN_TEST(test_fixed_profiles_apply_at_once_and_ignore_the_battery);
  RUN_TEST(test_auto_without_a_battery_reading_keeps_the_profile);
  return UNITY_END();
}
