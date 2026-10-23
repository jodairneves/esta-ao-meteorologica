#include "link.h"

#include <time.h>

#include <cstring>

#include "core/payload.h"
#include "core/schedule.h"
#include "trust_anchors.h"

namespace wx {

namespace {

constexpr uint16_t kKeepAliveS = 60;
/** How long a QoS 1 publication waits for the PUBACK. */
constexpr uint32_t kAckTimeoutMs = 10'000;

uint32_t epochNow() { return static_cast<uint32_t>(time(nullptr)); }

}  // namespace

void Link::begin(const MqttSettings& settings) {
  settings_ = settings;
  anchors_.append(kIsrgRootX1);
  anchors_.append(kIsrgRootX2);
  secure_.setTrustAnchors(&anchors_);

  mqtt_.setKeepAlive(kKeepAliveS);
  mqtt_.setCleanSession(false);
  mqtt_.setTimeout(kAckTimeoutMs);
  if (settings_.tls) {
    mqtt_.begin(settings_.host, settings_.port, secure_);
  } else {
    mqtt_.begin(settings_.host, settings_.port, plain_);
  }
  mqtt_.onMessageAdvanced([this](MQTTClient*, char topic[], char bytes[], int length) {
    onMessage(topic, bytes, length);
  });

  char will[96];
  topic(will, sizeof(will), "status");
  mqtt_.setWill(will, kOfflineStatus, true, 1);
}

bool Link::wifiUp(RtcState& rtc, uint32_t timeoutMs) {
  if (wifiConnected()) return true;
  WiFi.forceSleepWake();
  delay(1);
  WiFi.persistent(false);  // credentials stay as the portal saved them
  WiFi.mode(WIFI_STA);

  const String ssid = WiFi.SSID();
  const String psk = WiFi.psk();
  if (ssid.length() == 0) return false;
  const bool remembered = rtc.wifiChannel != 0;
  if (remembered) {
    WiFi.begin(ssid.c_str(), psk.c_str(), rtc.wifiChannel, rtc.bssid, true);
  } else {
    WiFi.begin(ssid.c_str(), psk.c_str());
  }

  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) delay(50);
  if (WiFi.status() != WL_CONNECTED && remembered) {
    // The access point may have changed channel: forget it and scan normally.
    rtc.wifiChannel = 0;
    WiFi.disconnect();
    WiFi.begin(ssid.c_str(), psk.c_str());
    const uint32_t retry = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - retry < timeoutMs) delay(50);
  }
  if (WiFi.status() != WL_CONNECTED) return false;

  rtc.wifiChannel = static_cast<uint8_t>(WiFi.channel());
  memcpy(rtc.bssid, WiFi.BSSID(), sizeof(rtc.bssid));
  if (hadWifi_) wifiReconnects_++;
  hadWifi_ = true;
  return true;
}

void Link::wifiOff() {
  if (mqtt_.connected()) mqtt_.disconnect();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  WiFi.forceSleepBegin();
  delay(1);
}

bool Link::syncClock(uint32_t timeoutMs) {
  if (clockIsSet(epochNow()) && wifiConnected()) {
    // SNTP keeps correcting the clock in the background while the radio is on.
    return true;
  }
  configTime(0, 0, "pool.ntp.org", "time.google.com", "a.st1.ntp.br");
  const uint32_t start = millis();
  while (!clockIsSet(epochNow()) && millis() - start < timeoutMs) delay(100);
  return clockIsSet(epochNow());
}

bool Link::mqttConnect() {
  if (mqtt_.connected()) return true;
  if (!wifiConnected()) return false;

  if (settings_.tls) {
    // Certificates are checked against the clock; without NTP the connection must fail.
    secure_.setX509Time(epochNow());
    if (!mflnChecked_) {
      // Smaller TLS buffers (less RAM) when the broker accepts Max Fragment Length.
      if (secure_.probeMaxFragmentLength(settings_.host, settings_.port, 1024)) {
        secure_.setBufferSizes(1024, 1024);
      }
      mflnChecked_ = true;
    }
  }

  char clientId[40];
  snprintf(clientId, sizeof(clientId), "st-%s", settings_.code);
  if (!mqtt_.connect(clientId, settings_.code, settings_.password)) return false;

  char config[96];
  char command[96];
  topic(config, sizeof(config), "config");
  topic(command, sizeof(command), "cmd");
  // Subscribing on every connection redelivers the retained configuration.
  if (!mqtt_.subscribe(config, 1) || !mqtt_.subscribe(command, 1)) {
    mqtt_.disconnect();
    return false;
  }
  if (hadMqtt_) mqttReconnects_++;
  hadMqtt_ = true;
  return true;
}

bool Link::mqttConnected() { return mqtt_.connected(); }

void Link::mqttDisconnect() {
  if (mqtt_.connected()) mqtt_.disconnect();
}

bool Link::publish(const char* kind, const char* payload, size_t length, bool retained) {
  char name[96];
  topic(name, sizeof(name), kind);
  return mqtt_.publish(name, payload, static_cast<int>(length), retained, 1);
}

void Link::loop() { mqtt_.loop(); }

bool Link::takeMessage(InboxMessage& out) {
  if (inboxCount_ == 0) return false;
  out = inbox_[inboxHead_];
  inboxHead_ = static_cast<uint8_t>((inboxHead_ + 1) % kInboxSize);
  inboxCount_--;
  return true;
}

int8_t Link::rssi() const { return wifiConnected() ? static_cast<int8_t>(WiFi.RSSI()) : 0; }

void Link::topic(char* out, size_t capacity, const char* kind) const {
  snprintf(out, capacity, "weather/v1/%s/%s", settings_.code, kind);
}

void Link::onMessage(char topic[], char bytes[], int length) {
  // Only copied here: acting inside the callback would run before the PUBACK goes out.
  const char* kind = strrchr(topic, '/');
  if (!kind || length <= 0 || length >= static_cast<int>(sizeof(InboxMessage::payload))) return;
  if (inboxCount_ == kInboxSize) {
    inboxHead_ = static_cast<uint8_t>((inboxHead_ + 1) % kInboxSize);
    inboxCount_--;
  }
  InboxMessage& slot = inbox_[(inboxHead_ + inboxCount_) % kInboxSize];
  slot.kind = strcmp(kind, "/config") == 0 ? InboxMessage::Kind::Config : InboxMessage::Kind::Command;
  memcpy(slot.payload, bytes, static_cast<size_t>(length));
  slot.payload[length] = '\0';
  slot.length = static_cast<uint16_t>(length);
  inboxCount_++;
}

}  // namespace wx
