#pragma once

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <MQTT.h>
#include <WiFiClientSecureBearSSL.h>

#include <memory>

#include "core/rtc_state.h"
#include "settings_store.h"

namespace wx {

/** A message received on `config` or `cmd`, copied out of the MQTT callback. */
struct InboxMessage {
  enum class Kind : uint8_t { Config, Command } kind = Kind::Config;
  uint16_t length = 0;
  char payload[512] = {0};
};

/**
 * Wi-Fi, clock and MQTT session of the station (design §3.9, §3.10 and §4.4): persistent
 * session (`st-{code}`, clean = false), QoS 1 publications that only succeed after the PUBACK,
 * retained LWT `offline`, subscriptions to `config` and `cmd` on every connection, TLS with
 * the ISRG roots and the clock set by NTP.
 */
class Link {
 public:
  void begin(const MqttSettings& settings);
  /** New MQTT settings (local page): drops the session and starts over with them. */
  void reconfigure(const MqttSettings& settings);
  /** Keeps the Wi-Fi network in use across restarts (it is only in RAM until then). */
  void saveWifi();

  /** Connects to the saved access point; uses the channel/BSSID in RTC memory to be quick. */
  bool wifiUp(RtcState& rtc, uint32_t timeoutMs);
  /** Why the last wifiUp() gave up: WiFi.status() (WL_WRONG_PASSWORD, WL_NO_SSID_AVAIL…). */
  int wifiFailure() const { return wifiFailure_; }
  /** wifiFailure() when the portal never saved a network. */
  static constexpr int kNoSavedNetwork = -1;
  /** Name of the network the last wifiUp() tried. */
  const char* wifiSsid() const { return wifiSsid_; }

  /** The network of wifiSsid() as a scan sees it (the strongest access point with that name). */
  struct WifiSighting {
    bool found = false;
    uint8_t channel = 0;
    int32_t rssi = 0;
    uint8_t encryption = 0;  // wl_enc_type
  };
  WifiSighting findNetwork();
  /** Radio off (Economy, before deep sleep). */
  void wifiOff();
  bool wifiConnected() const { return WiFi.status() == WL_CONNECTED; }

  /** NTP; true when the clock is set (needed for TLS and for timestamps). */
  bool syncClock(uint32_t timeoutMs);

  /** MQTT session with LWT; subscribes to `config` and `cmd`. */
  bool mqttConnect();
  bool mqttConnected();
  /** Graceful disconnect: the broker does not publish the LWT. */
  void mqttDisconnect();
  /** Why the last connection failed: lwmqtt error (-3 = no TCP connection) and CONNACK code
   *  (4 = bad username or password, 5 = not authorized). */
  int mqttError();
  int mqttReturnCode();

  /** QoS 1 publication; returns only after the PUBACK (or false on failure). */
  bool publish(const char* kind, const char* payload, size_t length, bool retained);

  /** Processes incoming packets and keepalive. */
  void loop();

  /** Moves the next received message to `out`; false when the inbox is empty. */
  bool takeMessage(InboxMessage& out);

  int8_t rssi() const;
  uint16_t wifiReconnects() const { return wifiReconnects_; }
  uint16_t mqttReconnects() const { return mqttReconnects_; }

 private:
  void topic(char* out, size_t capacity, const char* kind) const;
  void onMessage(char topic[], char bytes[], int length);

  MqttSettings settings_;
  WiFiClient plain_;
  BearSSL::WiFiClientSecure secure_;
  BearSSL::X509List anchors_;
  bool anchorsReady_ = false;
  bool mflnChecked_ = false;
  // Created in begin(): until then its 3 KB of buffers stay with the configuration portal,
  // which builds each page in RAM.
  std::unique_ptr<MQTTClient> mqtt_;
  bool hadWifi_ = false;
  bool hadMqtt_ = false;
  int wifiFailure_ = WL_IDLE_STATUS;
  char wifiSsid_[33] = {0};
  uint16_t wifiReconnects_ = 0;
  uint16_t mqttReconnects_ = 0;

  static constexpr uint8_t kInboxSize = 4;
  InboxMessage inbox_[kInboxSize];
  uint8_t inboxHead_ = 0;
  uint8_t inboxCount_ = 0;
};

}  // namespace wx
