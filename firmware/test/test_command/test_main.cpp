#include <unity.h>

#include <cstring>
#include <initializer_list>

#include "core/command.h"

using wx::CommandKind;

void setUp() {}
void tearDown() {}

static wx::CommandParse parse(const char* json) { return wx::parseCommand(json, strlen(json)); }

void test_parses_a_command() {
  const auto result =
      parse(R"({"v":1,"id":"0192f1c4-7a3e-7c1d-9a52-2c1f0b6e4d10","cmd":"identify","exp":1761184860,"args":{}})");
  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL(CommandKind::Identify, result.command.kind);
  TEST_ASSERT_EQUAL_STRING("0192f1c4-7a3e-7c1d-9a52-2c1f0b6e4d10", result.command.id);
  TEST_ASSERT_TRUE(wx::isExpired(result.command, 1761184861));
  TEST_ASSERT_FALSE(wx::isExpired(result.command, 1761184860));
}

void test_keeps_the_id_of_an_unknown_command_to_acknowledge_it() {
  const auto result = parse(R"({"v":1,"id":"abc","cmd":"format","exp":1761184860})");
  TEST_ASSERT_FALSE(result.ok);
  TEST_ASSERT_TRUE(result.hasId);
  TEST_ASSERT_EQUAL_STRING("abc", result.command.id);
}

void test_ignores_an_id_that_cannot_be_echoed_back() {
  const auto result = parse(R"({"v":1,"id":"a\"b","cmd":"reboot","exp":1761184860})");
  TEST_ASSERT_FALSE(result.ok);
  TEST_ASSERT_FALSE(result.hasId);
}

void test_remembers_executed_commands() {
  wx::RecentCommands recent;
  TEST_ASSERT_FALSE(recent.seen("a"));
  recent.remember("a");
  TEST_ASSERT_TRUE(recent.seen("a"));
  for (const char* id : {"b", "c", "d", "e"}) recent.remember(id);
  TEST_ASSERT_FALSE(recent.seen("a"));  // only the last four are kept
  TEST_ASSERT_TRUE(recent.seen("e"));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_parses_a_command);
  RUN_TEST(test_keeps_the_id_of_an_unknown_command_to_acknowledge_it);
  RUN_TEST(test_ignores_an_id_that_cannot_be_echoed_back);
  RUN_TEST(test_remembers_executed_commands);
  return UNITY_END();
}
