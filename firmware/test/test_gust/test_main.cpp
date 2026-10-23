#include <unity.h>

#include "core/gust.h"

using wx::GustTracker;

void setUp() {}
void tearDown() {}

void test_gust_is_the_highest_three_second_sum() {
  GustTracker tracker;
  const uint32_t seconds[] = {1, 2, 9, 8, 7, 0, 1};
  for (uint32_t pulses : seconds) tracker.addSecond(pulses);
  TEST_ASSERT_EQUAL_UINT32(28, tracker.total());
  TEST_ASSERT_EQUAL_UINT32(24, tracker.gust());  // 9 + 8 + 7
}

void test_gust_never_exceeds_the_interval_total() {
  GustTracker tracker;
  for (int i = 0; i < 10; i++) tracker.addSecond(30);  // gusty interval
  tracker.reset();
  tracker.addSecond(1);  // calm start of the next interval
  TEST_ASSERT_EQUAL_UINT32(1, tracker.total());
  TEST_ASSERT_EQUAL_UINT32(1, tracker.gust());
}

void test_reset_starts_from_zero() {
  GustTracker tracker;
  tracker.addSecond(5);
  tracker.reset();
  TEST_ASSERT_EQUAL_UINT32(0, tracker.total());
  TEST_ASSERT_EQUAL_UINT32(0, tracker.gust());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_gust_is_the_highest_three_second_sum);
  RUN_TEST(test_gust_never_exceeds_the_interval_total);
  RUN_TEST(test_reset_starts_from_zero);
  return UNITY_END();
}
