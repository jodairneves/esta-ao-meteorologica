#include "station_code.h"

#include <cstring>

namespace wx {

bool isValidStationCode(const char* code) {
  if (code == nullptr) return false;
  const size_t length = strlen(code);
  if (length < 3 || length > 32) return false;
  for (size_t i = 0; i < length; i++) {
    const char c = code[i];
    const bool allowed = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
    if (!allowed) return false;
  }
  return code[0] != '-' && code[length - 1] != '-';
}

const char* mqttUsername(const char* user, const char* code) {
  return user != nullptr && user[0] != '\0' ? user : code;
}

}  // namespace wx
