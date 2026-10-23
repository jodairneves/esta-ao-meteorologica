#include <unity.h>

#include "core/local_form.h"

using wx::LocalFormParse;

void setUp() {}
void tearDown() {}

static LocalFormParse server(const char* host, const char* port, const char* code) {
  return wx::parseLocalForm(host, port, nullptr, code, "", "", "");
}

void test_accepts_a_server_change_that_keeps_password_and_network() {
  const LocalFormParse result = wx::parseLocalForm("10.25.50.106", "1883", nullptr, "bancada", "", "", "");
  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL_STRING("10.25.50.106", result.form.host);
  TEST_ASSERT_EQUAL_UINT16(1883, result.form.port);
  TEST_ASSERT_FALSE(result.form.tls);  // an unchecked box is not sent at all
  TEST_ASSERT_EQUAL_STRING("", result.form.password);
  TEST_ASSERT_EQUAL_STRING("", result.form.ssid);
}

void test_reads_tls_password_and_a_new_network() {
  const LocalFormParse result =
      wx::parseLocalForm("mqtt.exemplo.com.br", "8883", "1", "sede", "s3nh4-MQTT", "Casa 2G", "senha-do-wifi");
  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.form.tls);
  TEST_ASSERT_EQUAL_STRING("s3nh4-MQTT", result.form.password);
  TEST_ASSERT_EQUAL_STRING("Casa 2G", result.form.ssid);
  TEST_ASSERT_EQUAL_STRING("senha-do-wifi", result.form.wifiPassword);
}

void test_rejects_bad_server_fields() {
  TEST_ASSERT_FALSE(server("", "1883", "sede").ok);
  TEST_ASSERT_FALSE(server("mqtt com espaco", "1883", "sede").ok);
  TEST_ASSERT_FALSE(server("10.0.0.1", "0", "sede").ok);
  TEST_ASSERT_FALSE(server("10.0.0.1", "70000", "sede").ok);
  TEST_ASSERT_FALSE(server("10.0.0.1", "18x3", "sede").ok);
  TEST_ASSERT_FALSE(server("10.0.0.1", "1883", "Bancada").ok);  // capitalized by the phone
  TEST_ASSERT_FALSE(server("10.0.0.1", "1883", "-sede").ok);
  TEST_ASSERT_NOT_NULL(server("10.0.0.1", "1883", "Bancada").error);
}

void test_checks_the_wifi_fields_together() {
  // A password without the network name, and WPA2 passwords out of 8 to 64 characters.
  TEST_ASSERT_FALSE(wx::parseLocalForm("h", "1883", nullptr, "sede", "", "", "senha-sem-rede").ok);
  TEST_ASSERT_FALSE(wx::parseLocalForm("h", "1883", nullptr, "sede", "", "Casa", "curta").ok);
  TEST_ASSERT_FALSE(
      wx::parseLocalForm("h", "1883", nullptr, "sede", "", "um nome de rede longo demais para o wifi", "").ok);
  // An open network: name without password.
  TEST_ASSERT_TRUE(wx::parseLocalForm("h", "1883", nullptr, "sede", "", "Visitantes", "").ok);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_accepts_a_server_change_that_keeps_password_and_network);
  RUN_TEST(test_reads_tls_password_and_a_new_network);
  RUN_TEST(test_rejects_bad_server_fields);
  RUN_TEST(test_checks_the_wifi_fields_together);
  return UNITY_END();
}
