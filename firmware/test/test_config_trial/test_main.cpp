#include <unity.h>

#include "core/config_trial.h"

using Outcome = wx::ConfigTrial::Outcome;

void setUp() {}
void tearDown() {}

void test_is_idle_until_started() {
  wx::ConfigTrial trial;
  TEST_ASSERT_EQUAL(Outcome::Idle, trial.update(1000, true, true));
  TEST_ASSERT_EQUAL_UINT32(0, trial.secondsLeft(1000));
}

void test_keeps_a_server_change_once_the_server_answers() {
  wx::ConfigTrial trial;
  trial.start(1000, false, true);
  TEST_ASSERT_EQUAL(Outcome::Pending, trial.update(5000, true, false));
  TEST_ASSERT_EQUAL_UINT32(116, trial.secondsLeft(5000));
  TEST_ASSERT_EQUAL(Outcome::Kept, trial.update(9000, true, true));
  TEST_ASSERT_EQUAL(Outcome::Idle, trial.update(9500, true, true));  // reported once
}

void test_a_network_change_needs_only_the_network() {
  // The server may have been failing before: it does not hold the new network back.
  wx::ConfigTrial trial;
  trial.start(0, true, false);
  TEST_ASSERT_EQUAL(Outcome::Pending, trial.update(3000, false, false));
  TEST_ASSERT_EQUAL(Outcome::Kept, trial.update(9000, true, false));
}

void test_both_changes_need_both_connections() {
  wx::ConfigTrial trial;
  trial.start(0, true, true);
  TEST_ASSERT_EQUAL(Outcome::Pending, trial.update(9000, true, false));
  TEST_ASSERT_EQUAL(Outcome::Kept, trial.update(12000, true, true));
}

void test_reverts_after_two_minutes_even_across_the_millis_wrap() {
  wx::ConfigTrial trial;
  const uint32_t start = 0xFFFFF000u;  // millis() wraps about 4 s later
  trial.start(start, false, true);
  TEST_ASSERT_EQUAL(Outcome::Pending, trial.update(start + 119'000, true, false));
  TEST_ASSERT_EQUAL(Outcome::Reverted, trial.update(start + 120'000, true, false));
  TEST_ASSERT_FALSE(trial.active());
}

void test_a_cancelled_trial_reports_nothing_but_remembers_what_changed() {
  wx::ConfigTrial trial;
  trial.start(0, true, false);
  trial.cancel();
  TEST_ASSERT_EQUAL(Outcome::Idle, trial.update(130'000, false, false));
  TEST_ASSERT_TRUE(trial.wifiChanged());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_is_idle_until_started);
  RUN_TEST(test_keeps_a_server_change_once_the_server_answers);
  RUN_TEST(test_a_network_change_needs_only_the_network);
  RUN_TEST(test_both_changes_need_both_connections);
  RUN_TEST(test_reverts_after_two_minutes_even_across_the_millis_wrap);
  RUN_TEST(test_a_cancelled_trial_reports_nothing_but_remembers_what_changed);
  return UNITY_END();
}
