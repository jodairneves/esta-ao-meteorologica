#include <unity.h>

#include <cmath>
#include <cstring>

#include "core/payload.h"

using wx::ReadingBuffer;

void setUp() {}
void tearDown() {}

static wx::Reading sample(uint32_t seq) {
  wx::Reading r;
  r.seq = seq;
  r.ts = 1761181260 + seq * 60;
  r.dur = 60;
  r.temp = 24.614f;
  r.hum = 63.24f;
  r.pres = 1008.4249f;
  r.windPulses = 87;
  r.gustPulses = 7;
  r.rainCount = 152;
  return r;
}

void test_telemetry_follows_the_contract() {
  ReadingBuffer buffer;
  buffer.push(sample(1));
  char out[512];
  const auto batch = wx::writeTelemetry(buffer, 2864434397u, out, sizeof(out));
  TEST_ASSERT_EQUAL_UINT32(1, batch.readings);
  TEST_ASSERT_EQUAL_STRING(
      R"({"v":1,"run":2864434397,"readings":[{"seq":1,"ts":1761181320,"dur":60,"temp":24.61,)"
      R"("hum":63.2,"pres":1008.42,"wind_p":87,"gust_p":7,"rain_c":152}]})",
      out);
}

void test_missing_values_are_null_never_zero() {
  ReadingBuffer buffer;
  wx::Reading r = sample(1);
  r.pres = NAN;  // HTU21D version
  r.windPulses = wx::kNoCount;
  r.gustPulses = wx::kNoCount;
  r.rainCount = wx::kNoCount;
  buffer.push(r);
  char out[512];
  wx::writeTelemetry(buffer, 1, out, sizeof(out));
  TEST_ASSERT_NOT_NULL(strstr(out, "\"pres\":null"));
  TEST_ASSERT_NOT_NULL(strstr(out, "\"wind_p\":null,\"gust_p\":null,\"rain_c\":null"));
}

void test_batches_respect_the_count_and_the_size_limits() {
  ReadingBuffer buffer;
  for (uint32_t seq = 1; seq <= 45; seq++) buffer.push(sample(seq));
  static char big[8192];
  TEST_ASSERT_EQUAL_UINT32(wx::kMaxBatch, wx::writeTelemetry(buffer, 1, big, sizeof(big)).readings);

  char small[600];
  const auto limited = wx::writeTelemetry(buffer, 1, small, sizeof(small));
  TEST_ASSERT_GREATER_THAN(0, limited.readings);
  TEST_ASSERT_LESS_THAN(wx::kMaxBatch, limited.readings);
  TEST_ASSERT_LESS_THAN(sizeof(small), limited.length + 1);
}

void test_undated_readings_are_not_sent() {
  ReadingBuffer buffer;
  wx::Reading r = sample(1);
  r.ts = 0;
  buffer.push(r);
  char out[512];
  TEST_ASSERT_EQUAL_UINT32(0, wx::writeTelemetry(buffer, 1, out, sizeof(out)).readings);
}

void test_status_and_lwt() {
  wx::StatusInfo status;
  status.state = wx::LinkState::Sleeping;
  status.ts = 1761181260;
  status.mode = wx::PowerMode::Economy;
  status.next = 1761181860;
  status.fw = "1.0.0";
  char out[256];
  wx::writeStatus(status, out, sizeof(out));
  TEST_ASSERT_EQUAL_STRING(
      R"({"v":1,"state":"sleeping","ts":1761181260,"mode":"economy","next":1761181860,"fw":"1.0.0"})", out);
  TEST_ASSERT_EQUAL_STRING(R"({"v":1,"state":"offline"})", wx::kOfflineStatus);
}

void test_health_reports_the_climate_sensor_of_the_station_version() {
  wx::HealthInfo health;
  health.ts = 1761181260;
  health.fw = "1.0.0";
  health.climate = wx::ClimateSensor::Htu21d;
  health.climateHealth = wx::SensorHealth::Ok;
  health.batteryMv = 0;
  char out[600];
  wx::writeHealth(health, out, sizeof(out));
  TEST_ASSERT_NOT_NULL(strstr(out, R"("sensors":{"bme280":"absent","htu21d":"ok","wind":"ok","rain":"ok"})"));
  TEST_ASSERT_NOT_NULL(strstr(out, R"("bat_mv":null)"));
  TEST_ASSERT_NOT_NULL(strstr(out, R"("cfg_rev":null)"));
  TEST_ASSERT_NOT_NULL(strstr(out, R"("ip":null)"));

  health.ip = "10.25.50.111";
  wx::writeHealth(health, out, sizeof(out));
  TEST_ASSERT_NOT_NULL(strstr(out, R"("ip":"10.25.50.111")"));
}

void test_events_carry_their_data() {
  char out[256];
  wx::writeEvent(wx::EventLevel::Info, "CONFIG_APPLIED", "Configuração aplicada", R"({"rev":3})", 1761181260, out,
                 sizeof(out));
  TEST_ASSERT_EQUAL_STRING(
      R"({"v":1,"ts":1761181260,"level":"info","code":"CONFIG_APPLIED","msg":"Configuração aplicada","data":{"rev":3}})",
      out);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_telemetry_follows_the_contract);
  RUN_TEST(test_missing_values_are_null_never_zero);
  RUN_TEST(test_batches_respect_the_count_and_the_size_limits);
  RUN_TEST(test_undated_readings_are_not_sent);
  RUN_TEST(test_status_and_lwt);
  RUN_TEST(test_health_reports_the_climate_sensor_of_the_station_version);
  RUN_TEST(test_events_carry_their_data);
  return UNITY_END();
}
