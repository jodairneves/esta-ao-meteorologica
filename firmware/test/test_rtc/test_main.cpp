#include <unity.h>

#include <cmath>
#include <cstring>

#include "core/crc.h"
#include "core/rtc_state.h"

void setUp() {}
void tearDown() {}

void test_crc32_matches_the_standard_check_value() {
  TEST_ASSERT_EQUAL_HEX32(0xCBF43926u, wx::crc32("123456789", 9));
}

void test_sealed_state_is_valid_and_any_change_breaks_it() {
  wx::RtcState state = wx::freshState(1234);
  state.seq = 42;
  wx::seal(state);
  TEST_ASSERT_TRUE(wx::isValid(state));
  state.rainCount++;  // a bit flipped by a power glitch
  TEST_ASSERT_FALSE(wx::isValid(state));
}

void test_garbage_memory_is_not_valid() {
  wx::RtcState state;
  memset(static_cast<void*>(&state), 0xA5, sizeof(state));
  TEST_ASSERT_FALSE(wx::isValid(state));
}

void test_a_new_run_is_never_zero() {
  TEST_ASSERT_EQUAL_UINT32(1, wx::freshState(0).run);
  TEST_ASSERT_EQUAL_UINT32(77, wx::freshState(77).run);
}

void test_survival_readings_pack_into_rtc_memory() {
  wx::Reading reading;
  reading.seq = 9;
  reading.ts = 1761181260;
  reading.dur = 1800;
  reading.temp = -3.27f;
  reading.hum = 88.4f;
  reading.pres = NAN;  // HTU21D version
  const wx::Reading back = wx::unpack(wx::pack(reading));
  TEST_ASSERT_EQUAL_UINT32(9, back.seq);
  TEST_ASSERT_FLOAT_WITHIN(0.005f, -3.27f, back.temp);
  TEST_ASSERT_FLOAT_WITHIN(0.05f, 88.4f, back.hum);
  TEST_ASSERT_TRUE(std::isnan(back.pres));
  TEST_ASSERT_EQUAL_UINT32(wx::kNoCount, back.windPulses);  // wind and rain are not measured
  TEST_ASSERT_EQUAL_UINT32(wx::kNoCount, back.rainCount);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_crc32_matches_the_standard_check_value);
  RUN_TEST(test_sealed_state_is_valid_and_any_change_breaks_it);
  RUN_TEST(test_garbage_memory_is_not_valid);
  RUN_TEST(test_a_new_run_is_never_zero);
  RUN_TEST(test_survival_readings_pack_into_rtc_memory);
  return UNITY_END();
}
