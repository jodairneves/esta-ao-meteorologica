#include "local_form.h"

#include <cstdlib>
#include <cstring>

#include "flash_text.h"
#include "station_code.h"

namespace wx {

namespace {

const char* orEmpty(const char* text) { return text != nullptr ? text : ""; }

/** 1 to `max` printable ASCII characters, no spaces (hosts and MQTT passwords). */
bool isToken(const char* text, size_t max) {
  const size_t length = strlen(text);
  if (length == 0 || length > max) return false;
  for (size_t i = 0; i < length; i++) {
    if (text[i] < 0x21 || text[i] > 0x7e) return false;
  }
  return true;
}

void copy(char* to, size_t capacity, const char* from) {
  strncpy(to, from, capacity - 1);
  to[capacity - 1] = '\0';
}

}  // namespace

LocalFormParse parseLocalForm(const char* host, const char* port, const char* tls, const char* code,
                              const char* password, const char* ssid, const char* wifiPassword) {
  LocalFormParse result;
  LocalForm& form = result.form;
  host = orEmpty(host);
  port = orEmpty(port);
  code = orEmpty(code);
  password = orEmpty(password);
  ssid = orEmpty(ssid);
  wifiPassword = orEmpty(wifiPassword);

  if (!isToken(host, sizeof(form.host) - 1)) {
    result.error = WX_TEXT("Informe o servidor MQTT, sem espaços.");
    return result;
  }
  char* end = nullptr;
  const unsigned long number = strtoul(port, &end, 10);
  if (*port == '\0' || *end != '\0' || number < 1 || number > 65535) {
    result.error = WX_TEXT("A porta deve ser um número de 1 a 65535.");
    return result;
  }
  if (!isValidStationCode(code)) {
    result.error = WX_TEXT("O código da estação tem de 3 a 32 letras minúsculas, números ou hífens.");
    return result;
  }
  if (*password != '\0' && !isToken(password, sizeof(form.password) - 1)) {
    result.error = WX_TEXT("A senha MQTT tem caracteres inválidos.");
    return result;
  }
  if (strlen(ssid) > sizeof(form.ssid) - 1) {
    result.error = WX_TEXT("O nome da rede Wi-Fi tem no máximo 32 caracteres.");
    return result;
  }
  if (*ssid == '\0' && *wifiPassword != '\0') {
    result.error = WX_TEXT("Para trocar de rede, informe também o nome dela.");
    return result;
  }
  const size_t wifiLength = strlen(wifiPassword);
  if (wifiLength != 0 && (wifiLength < 8 || wifiLength > 64)) {
    result.error = WX_TEXT("A senha do Wi-Fi tem de 8 a 63 caracteres (vazia só em rede aberta).");
    return result;
  }

  copy(form.host, sizeof(form.host), host);
  form.port = static_cast<uint16_t>(number);
  form.tls = tls != nullptr && strcmp(tls, "1") == 0;
  copy(form.code, sizeof(form.code), code);
  copy(form.password, sizeof(form.password), password);
  copy(form.ssid, sizeof(form.ssid), ssid);
  copy(form.wifiPassword, sizeof(form.wifiPassword), wifiPassword);
  result.ok = true;
  return result;
}

}  // namespace wx
