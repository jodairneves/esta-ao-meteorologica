#include <unity.h>

#include <cstring>

#include "core/html.h"

void setUp() {}
void tearDown() {}

void test_escapes_markup_and_quotes() {
  char out[64];
  const size_t length = wx::escapeHtml("Casa <2G> & \"Ana's\"", out, sizeof(out));
  TEST_ASSERT_EQUAL_STRING("Casa &lt;2G&gt; &amp; &quot;Ana&#39;s&quot;", out);
  TEST_ASSERT_EQUAL_UINT32(strlen(out), length);
}

void test_never_cuts_an_escape_in_half() {
  char fits[8];
  wx::escapeHtml("ab&cd", fits, sizeof(fits));  // "ab&amp;" takes 8 bytes with the terminator
  TEST_ASSERT_EQUAL_STRING("ab&amp;", fits);
  char out[7];
  wx::escapeHtml("ab&cd", out, sizeof(out));
  TEST_ASSERT_EQUAL_STRING("ab", out);
  wx::escapeHtml(nullptr, out, sizeof(out));
  TEST_ASSERT_EQUAL_STRING("", out);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_escapes_markup_and_quotes);
  RUN_TEST(test_never_cuts_an_escape_in_half);
  return UNITY_END();
}
