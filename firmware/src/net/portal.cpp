#include "portal.h"

#include <ESP8266WiFi.h>
#include <WiFiManager.h>

#include <cstdlib>
#include <cstring>

#ifndef PORTAL_PASSWORD
#define PORTAL_PASSWORD "estacao-config"
#endif

namespace wx {

namespace {

constexpr uint16_t kPortalTimeoutS = 300;

void copy(char* to, size_t capacity, const char* from) {
  strncpy(to, from, capacity - 1);
  to[capacity - 1] = '\0';
}

}  // namespace

String portalName() {
  char name[24];
  snprintf(name, sizeof(name), "Estacao-%06X", ESP.getChipId());
  return String(name);
}

bool runConfigPortal(MqttSettings& settings) {
  char port[8];
  snprintf(port, sizeof(port), "%u", settings.port);

  WiFiManager manager;
  manager.setTitle("Estação Meteorológica");
  manager.setConfigPortalTimeout(kPortalTimeoutS);
  manager.setBreakAfterConfig(true);
  manager.setShowInfoUpdate(false);

  WiFiManagerParameter host("host", "Servidor MQTT (ex.: mqtt.seudominio.com.br)", settings.host,
                            sizeof(settings.host) - 1);
  WiFiManagerParameter portField("port", "Porta (8883 com TLS)", port, 6, "type=\"number\"");
  // A checkbox only sends its value when checked.
  WiFiManagerParameter tls("tls", "Conexão segura (TLS)", "1", 2,
                           settings.tls ? "type=\"checkbox\" checked" : "type=\"checkbox\"",
                           WFM_LABEL_AFTER);
  WiFiManagerParameter code("code", "Código da estação (usuário MQTT)", settings.code,
                            sizeof(settings.code) - 1);
  WiFiManagerParameter password("password", "Senha MQTT (mostrada uma vez no painel)", "",
                                sizeof(settings.password) - 1, "type=\"password\"");
  manager.addParameter(&host);
  manager.addParameter(&portField);
  manager.addParameter(&tls);
  manager.addParameter(&code);
  manager.addParameter(&password);

  const bool online = manager.startConfigPortal(portalName().c_str(), PORTAL_PASSWORD);

  copy(settings.host, sizeof(settings.host), host.getValue());
  settings.port = static_cast<uint16_t>(strtoul(portField.getValue(), nullptr, 10));
  settings.tls = strcmp(tls.getValue(), "1") == 0;
  copy(settings.code, sizeof(settings.code), code.getValue());
  // An empty password field keeps the one saved before (changing only the Wi-Fi is common).
  if (strlen(password.getValue()) > 0) {
    copy(settings.password, sizeof(settings.password), password.getValue());
  }
  if (!settings.complete()) return false;
  saveMqttSettings(settings);
  return online;
}

}  // namespace wx
