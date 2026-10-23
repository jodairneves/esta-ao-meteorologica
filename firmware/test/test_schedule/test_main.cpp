#include <unity.h>

#include "core/schedule.h"

void setUp() {}
void tearDown() {}

void test_intervals_close_on_the_wall_clock() {
  TEST_ASSERT_EQUAL_UINT32(1761181260, wx::nextBoundary(1761181201, 60));
  TEST_ASSERT_EQUAL_UINT32(1761181320, wx::nextBoundary(1761181260, 60));  // never "now"
  TEST_ASSERT_EQUAL_UINT32(1761181800, wx::nextBoundary(1761181260, 600));
}

void test_millis_until_the_boundary() {
  TEST_ASSERT_EQUAL_UINT32(59'250, wx::millisUntil(1761181260, 1761181200, 750));
  TEST_ASSERT_EQUAL_UINT32(0, wx::millisUntil(1761181200, 1761181260, 0));
}

void test_clock_validity() {
  TEST_ASSERT_FALSE(wx::clockIsSet(8));  // ESP8266 boots at epoch 0
  TEST_ASSERT_TRUE(wx::clockIsSet(1761181260));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_intervals_close_on_the_wall_clock);
  RUN_TEST(test_millis_until_the_boundary);
  RUN_TEST(test_clock_validity);
  return UNITY_END();
}
