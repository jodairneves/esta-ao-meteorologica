#include "portal.h"

#include <ESP8266WiFi.h>
#include <WiFiManager.h>

#include <cstdlib>
#include <cstring>
#include <vector>

#ifndef PORTAL_PASSWORD
#define PORTAL_PASSWORD "12345678"
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

namespace {

/** One portal session; `saved` tells a save apart from a timeout. Returns the Wi-Fi state. */
bool openPortal(MqttSettings& settings, bool& saved) {
  char port[8];
  snprintf(port, sizeof(port), "%u", settings.port);

  WiFiManager manager;
  manager.setTitle("Estação Meteorológica");
  manager.setConfigPortalTimeout(kPortalTimeoutS);
  manager.setBreakAfterConfig(true);
  manager.setShowInfoUpdate(false);
  manager.setSaveConfigCallback([&saved] { saved = true; });
  // The phone opens the captive portal on "/": send it straight to the Wi-Fi page, with the
  // networks scanned when it opens, the field to type one that is not listed and the server
  // fields (texts in include/wm_strings_pt_br.h). The callback runs before the library adds its
  // own routes, so this one takes precedence over the menu page.
  manager.setWebServerCallback([&manager] {
    manager.server->on("/", [&manager] {
      // Each page is assembled in RAM: the free heap here says how much room it has.
      Serial.printf_P(PSTR("[wx] portal aberto no celular: heap livre %u, maior bloco %u\n"),
                      static_cast<unsigned>(ESP.getFreeHeap()),
                      static_cast<unsigned>(ESP.getMaxFreeBlockSize()));
      manager.server->sendHeader("Location", "http://" + WiFi.softAPIP().toString() + "/wifi", true);
      manager.server->send(302, "text/plain", "");
    });
  });
  // The menu, now reachable only by its address, keeps just the Wi-Fi page.
  std::vector<const char*> menu = {"wifi"};
  manager.setMenu(menu);
  // Firmware goes in over USB only: an upload through the portal restarts the station instead.
  manager.setPreOtaUpdateCallback([] { ESP.restart(); });

  // `required` keeps the browser from saving without the server fields; phone keyboards must not
  // capitalize the host or the code (the code is the MQTT username).
  WiFiManagerParameter host("host", "Servidor MQTT (ex.: mqtt.seudominio.com.br)", settings.host,
                            sizeof(settings.host) - 1,
                            "required autocapitalize=\"none\" autocorrect=\"off\" spellcheck=\"false\"");
  WiFiManagerParameter portField("port", "Porta (1883 sem TLS, 8883 com TLS)", port, 6,
                                 "type=\"number\" min=\"1\" max=\"65535\" required");
  // A checkbox only sends its value when checked.
  WiFiManagerParameter tls("tls", "Conexão segura (TLS)", "1", 2,
                           settings.tls ? "type=\"checkbox\" checked" : "type=\"checkbox\"",
                           WFM_LABEL_AFTER);
  // A label placed after its checkbox runs into the next label on the same line otherwise.
  WiFiManagerParameter tlsLineBreak("<br/>");
  WiFiManagerParameter code("code", "Código da estação (usuário MQTT)", settings.code,
                            sizeof(settings.code) - 1,
                            "required pattern=\"[a-z0-9][a-z0-9-]{1,30}[a-z0-9]\" autocapitalize=\"none\" "
                            "autocorrect=\"off\" spellcheck=\"false\" "
                            "title=\"Letras minúsculas, números e hífens, como no painel\"");
  WiFiManagerParameter password(
      "password", "Senha MQTT (mostrada uma vez no painel)", "", sizeof(settings.password) - 1,
      settings.password[0] == '\0' ? "type=\"password\" required"
                                   : "type=\"password\" placeholder=\"vazio mantém a senha salva\"");
  manager.addParameter(&host);
  manager.addParameter(&portField);
  manager.addParameter(&tls);
  manager.addParameter(&tlsLineBreak);
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
  return online;
}

}  // namespace

bool runConfigPortal(MqttSettings& settings) {
  for (;;) {
    bool saved = false;
    const bool online = openPortal(settings, saved);
    if (settings.complete()) {
      saveMqttSettings(settings);
      return online;
    }
    // Saved without the server fields (a page cut short, say): ask again rather than sleep with
    // half a configuration. A portal that timed out still gives up.
    if (!saved) return false;
    Serial.printf_P(PSTR("[wx] configuração sem os dados do servidor: portal aberto de novo\n"));
  }
}

}  // namespace wx
