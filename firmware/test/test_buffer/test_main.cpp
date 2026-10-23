#include <unity.h>

#include "core/reading_buffer.h"

using wx::Reading;
using wx::ReadingBuffer;

void setUp() {}
void tearDown() {}

static Reading reading(uint32_t seq, uint32_t ts = 1761181260, uint32_t endMs = 0) {
  Reading r;
  r.seq = seq;
  r.ts = ts;
  r.endMs = endMs;
  r.dur = 60;
  return r;
}

void test_keeps_readings_in_order() {
  ReadingBuffer buffer;
  buffer.push(reading(1));
  buffer.push(reading(2));
  TEST_ASSERT_EQUAL_UINT32(2, buffer.size());
  TEST_ASSERT_EQUAL_UINT32(1, buffer.at(0).seq);
  TEST_ASSERT_EQUAL_UINT32(2, buffer.at(1).seq);
}

void test_drops_the_oldest_when_full() {
  ReadingBuffer buffer;
  for (uint32_t seq = 1; seq <= ReadingBuffer::kCapacity; seq++) {
    TEST_ASSERT_FALSE(buffer.push(reading(seq)));
  }
  TEST_ASSERT_TRUE(buffer.push(reading(ReadingBuffer::kCapacity + 1)));
  TEST_ASSERT_EQUAL_UINT32(ReadingBuffer::kCapacity, buffer.size());
  TEST_ASSERT_EQUAL_UINT32(2, buffer.at(0).seq);
  TEST_ASSERT_EQUAL_UINT32(1, buffer.overflowed());
}

void test_removes_only_acknowledged_readings() {
  ReadingBuffer buffer;
  for (uint32_t seq = 1; seq <= 5; seq++) buffer.push(reading(seq));
  buffer.dropFront(3);
  TEST_ASSERT_EQUAL_UINT32(2, buffer.size());
  TEST_ASSERT_EQUAL_UINT32(4, buffer.at(0).seq);
  buffer.dropFront(10);
  TEST_ASSERT_TRUE(buffer.empty());
}

void test_dates_readings_taken_before_the_clock_was_set() {
  ReadingBuffer buffer;
  buffer.push(reading(1, 0, 10'000));
  buffer.push(reading(2, 0, 70'000));
  TEST_ASSERT_TRUE(buffer.frontUndated());
  buffer.fixTimestamps(1'761'181'300, 130'000);
  TEST_ASSERT_EQUAL_UINT32(1'761'181'300 - 120, buffer.at(0).ts);
  TEST_ASSERT_EQUAL_UINT32(1'761'181'300 - 60, buffer.at(1).ts);
  TEST_ASSERT_FALSE(buffer.frontUndated());
}

void test_dating_survives_the_millis_rollover() {
  ReadingBuffer buffer;
  buffer.push(reading(1, 0, 0xFFFFFFFFu - 4'999));  // 5 s before the rollover
  buffer.fixTimestamps(1'761'181'300, 5'000);       // 10 s later
  TEST_ASSERT_EQUAL_UINT32(1'761'181'290, buffer.at(0).ts);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_keeps_readings_in_order);
  RUN_TEST(test_drops_the_oldest_when_full);
  RUN_TEST(test_removes_only_acknowledged_readings);
  RUN_TEST(test_dates_readings_taken_before_the_clock_was_set);
  RUN_TEST(test_dating_survives_the_millis_rollover);
  return UNITY_END();
}
