#pragma once

#include <Arduino.h>
#include <ESP8266WebServer.h>

#include <functional>
#include <memory>

#include "core/local_form.h"

namespace wx {

/** What the local page shows about the station when it is opened. */
struct LocalPageView {
  const char* code = "";
  const char* host = "";
  uint16_t port = 0;
  bool tls = false;
  bool mqttConnected = false;
  /** Why the last MQTT connection failed (Link::mqttError and Link::mqttReturnCode). */
  int mqttError = 0;
  int mqttReturnCode = 0;
  const char* firmware = "";
  /** Seconds left to try the last change (0 = none being tried). */
  uint32_t trialSecondsLeft = 0;
  /** A change is waiting to be applied or being tried: another one has to wait. */
  bool changePending = false;
  enum class LastChange : uint8_t { None, Kept, Reverted } lastChange = LastChange::None;
};

/**
 * Configuration page served on the local network (design §4.5), behind HTTP Basic Auth (user
 * "admin"): the MQTT server fields and an optional Wi-Fi change, which the station tries before
 * keeping. Each page is streamed in small pieces from flash: the heap stays for TLS.
 */
class LocalPage {
 public:
  using PasswordFn = std::function<const char*()>;
  using ViewFn = std::function<LocalPageView()>;
  using SaveFn = std::function<void(const LocalForm&)>;
  using RestartFn = std::function<void()>;

  void begin(PasswordFn password, ViewFn view, SaveFn save, RestartFn restart);
  void loop();
  void stop();
  bool running() const { return server_ != nullptr; }

 private:
  bool authorized();
  bool validToken();
  void start(int status);
  void sendEscaped(const char* text);
  void finish();
  /** `notice` is a text in flash (PSTR). */
  void sendPage(int status, PGM_P notice, bool noticeIsError);
  void handleRoot();
  void handleSave();
  void handleRestart();

  std::unique_ptr<ESP8266WebServer> server_;
  /** Sent in every form and checked on POST: another site cannot post with the cached login. */
  char token_[17] = {0};
  PasswordFn password_;
  ViewFn view_;
  SaveFn save_;
  RestartFn restart_;
};

}  // namespace wx
