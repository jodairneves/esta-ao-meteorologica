#pragma once

#include <cstdint>

namespace wx {

/** What the station's local page sends (design §4.5). */
struct LocalForm {
  char host[64] = {0};
  uint16_t port = 0;
  bool tls = false;
  char code[33] = {0};
  /** Empty: keep the saved MQTT password. */
  char password[65] = {0};
  /** Empty: stay on the current Wi-Fi network. */
  char ssid[33] = {0};
  /** Empty with a new network: an open network. */
  char wifiPassword[65] = {0};
};

struct LocalFormParse {
  bool ok = false;
  LocalForm form;
  /** Why it was refused, in Portuguese (shown on the page). In flash on the ESP8266: read it with
   *  the *_P functions. */
  const char* error = nullptr;
};

/** Validates the fields of the local page; a missing field (null) counts as empty. */
LocalFormParse parseLocalForm(const char* host, const char* port, const char* tls, const char* code,
                              const char* password, const char* ssid, const char* wifiPassword);

}  // namespace wx
