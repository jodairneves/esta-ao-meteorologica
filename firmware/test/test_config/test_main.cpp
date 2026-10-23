#include <unity.h>

#include <cstring>
#include <initializer_list>
#include <string>

#include "core/device_config.h"

using wx::ConfigParse;

void setUp() {}
void tearDown() {}

static const char* kValid =
    R"({"v":1,"rev":3,"interval_s":60,"health_s":300,"economy_batch_s":600,"survival_sleep_s":1800,)"
    R"("rain_edge":"change","power":{"mode":"auto","economy_below_mv":3650,"survival_below_mv":3450,)"
    R"("recover_above_mv":3800,"bat_full_scale_mv":4200}})";

static ConfigParse parse(const std::string& json) { return wx::parseConfig(json.c_str(), json.size()); }

static std::string replaced(const char* from, const char* to) {
  std::string json(kValid);
  json.replace(json.find(from), strlen(from), to);
  return json;
}

void test_accepts_the_server_default_configuration() {
  const ConfigParse result = parse(kValid);
  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL_UINT32(3, result.rev);
  TEST_ASSERT_EQUAL_UINT16(60, result.config.intervalS);
  TEST_ASSERT_EQUAL_UINT16(3650, result.config.economyBelowMv);
}

void test_rejects_values_out_of_range_but_keeps_the_revision() {
  const ConfigParse result = parse(replaced("\"interval_s\":60", "\"interval_s\":5"));
  TEST_ASSERT_FALSE(result.ok);
  TEST_ASSERT_EQUAL_UINT32(3, result.rev);
  TEST_ASSERT_NOT_NULL(strstr(result.reason, "interval_s"));
}

void test_rejects_thresholds_out_of_order() {
  const ConfigParse result = parse(replaced("\"economy_below_mv\":3650", "\"economy_below_mv\":3400"));
  TEST_ASSERT_FALSE(result.ok);
  TEST_ASSERT_NOT_NULL(strstr(result.reason, "ordem"));
}

void test_rejects_a_batch_shorter_than_the_interval() {
  std::string json = replaced("\"interval_s\":60", "\"interval_s\":900");
  const ConfigParse result = parse(json);
  TEST_ASSERT_FALSE(result.ok);
  TEST_ASSERT_NOT_NULL(strstr(result.reason, "economy_batch_s"));
}

void test_rejects_unknown_enums_and_broken_json() {
  TEST_ASSERT_FALSE(parse(replaced("\"change\"", "\"both\"")).ok);
  TEST_ASSERT_FALSE(parse(replaced("\"auto\"", "\"turbo\"")).ok);
  TEST_ASSERT_FALSE(parse("{not json").ok);
  TEST_ASSERT_FALSE(parse(replaced("\"v\":1", "\"v\":2")).ok);
}

void test_round_trips_through_flash_storage() {
  const ConfigParse original = parse(replaced("\"change\"", "\"falling\""));
  TEST_ASSERT_TRUE(original.ok);
  char buffer[512];
  const size_t length = wx::writeConfig(original.config, 7, buffer, sizeof(buffer));
  TEST_ASSERT_GREATER_THAN(0, length);
  const ConfigParse again = wx::parseConfig(buffer, length);
  TEST_ASSERT_TRUE(again.ok);
  TEST_ASSERT_EQUAL_UINT32(7, again.rev);
  TEST_ASSERT_EQUAL_UINT16(original.config.survivalSleepS, again.config.survivalSleepS);
  TEST_ASSERT_EQUAL(wx::RainEdge::Falling, again.config.rainEdge);
}

void test_takes_the_local_page_password_when_present() {
  const ConfigParse absent = parse(kValid);
  TEST_ASSERT_EQUAL_STRING("", absent.config.localPassword);

  const ConfigParse present = parse(replaced("\"rev\":3", "\"rev\":3,\"local_password\":\"k7mp-9xq2-rt4w\""));
  TEST_ASSERT_TRUE(present.ok);
  TEST_ASSERT_EQUAL_STRING("k7mp-9xq2-rt4w", present.config.localPassword);

  char out[512];
  const size_t length = wx::writeConfig(present.config, present.rev, out, sizeof(out));
  const ConfigParse stored = wx::parseConfig(out, length);
  TEST_ASSERT_EQUAL_STRING("k7mp-9xq2-rt4w", stored.config.localPassword);
}

void test_rejects_a_weak_or_spaced_local_page_password() {
  for (const char* bad : {"\"curta\"", "\"com espaco\"", "42"}) {
    const std::string field = std::string("\"rev\":3,\"local_password\":") + bad;
    const ConfigParse result = parse(replaced("\"rev\":3", field.c_str()));
    TEST_ASSERT_FALSE(result.ok);
    TEST_ASSERT_NOT_NULL(strstr(result.reason, "local_password"));
  }
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_accepts_the_server_default_configuration);
  RUN_TEST(test_rejects_values_out_of_range_but_keeps_the_revision);
  RUN_TEST(test_rejects_thresholds_out_of_order);
  RUN_TEST(test_rejects_a_batch_shorter_than_the_interval);
  RUN_TEST(test_rejects_unknown_enums_and_broken_json);
  RUN_TEST(test_round_trips_through_flash_storage);
  RUN_TEST(test_takes_the_local_page_password_when_present);
  RUN_TEST(test_rejects_a_weak_or_spaced_local_page_password);
  return UNITY_END();
}
