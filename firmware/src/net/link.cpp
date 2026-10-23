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
  // WiFi.disconnect() erases the station's Wi-Fi settings, in flash when persistent (the core's
  // default). The portal has already saved them; from here on they change only through saveWifi().
  WiFi.persistent(false);
  if (!anchorsReady_) {
    anchors_.append(kIsrgRootX1);
    anchors_.append(kIsrgRootX2);
    secure_.setTrustAnchors(&anchors_);
    anchorsReady_ = true;
  }
  if (strcmp(settings_.host, settings.host) != 0 || settings_.port != settings.port) {
    // Another broker: probe Max Fragment Length again, starting from the full TLS buffers.
    mflnChecked_ = false;
    secure_.setBufferSizes(16384, 512);
  }
  settings_ = settings;
  // Name in the router's client list (DHCP): where to find the local page's address.
  char hostname[41];
  snprintf(hostname, sizeof(hostname), "estacao-%s", settings_.code);
  hostname[32] = '\0';  // the core refuses names longer than 32 characters
  WiFi.hostname(hostname);

  mqtt_ = std::make_unique<MQTTClient>(512, 2560);
  mqtt_->setKeepAlive(kKeepAliveS);
  mqtt_->setCleanSession(false);
  mqtt_->setTimeout(kAckTimeoutMs);
  if (settings_.tls) {
    mqtt_->begin(settings_.host, settings_.port, secure_);
  } else {
    mqtt_->begin(settings_.host, settings_.port, plain_);
  }
  mqtt_->onMessageAdvanced([this](MQTTClient*, char topic[], char bytes[], int length) {
    onMessage(topic, bytes, length);
  });

  char will[96];
  topic(will, sizeof(will), "status");
  mqtt_->setWill(will, kOfflineStatus, true, 1);
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

void Link::reconfigure(const MqttSettings& settings) {
  mqttDisconnect();
  begin(settings);
}

void Link::saveWifi() {
  station_config config{};
  wifi_station_get_config(&config);
  config.bssid_set = 0;  // the access point may change; the channel/BSSID hint lives in RTC memory
  wifi_station_set_config(&config);
}

void Link::wifiOff() {
  mqttDisconnect();
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
  if (!mqtt_) return false;
  if (mqtt_->connected()) return true;
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
  if (!mqtt_->connect(clientId, settings_.code, settings_.password)) return false;

  char config[96];
  char command[96];
  topic(config, sizeof(config), "config");
  topic(command, sizeof(command), "cmd");
  // Subscribing on every connection redelivers the retained configuration.
  if (!mqtt_->subscribe(config, 1) || !mqtt_->subscribe(command, 1)) {
    mqtt_->disconnect();
    return false;
  }
  if (hadMqtt_) mqttReconnects_++;
  hadMqtt_ = true;
  return true;
}

bool Link::mqttConnected() { return mqtt_ && mqtt_->connected(); }

void Link::mqttDisconnect() {
  if (mqttConnected()) mqtt_->disconnect();
}

int Link::mqttError() { return mqtt_ ? static_cast<int>(mqtt_->lastError()) : 0; }

int Link::mqttReturnCode() { return mqtt_ ? static_cast<int>(mqtt_->returnCode()) : 0; }

bool Link::publish(const char* kind, const char* payload, size_t length, bool retained) {
  char name[96];
  topic(name, sizeof(name), kind);
  return mqtt_ && mqtt_->publish(name, payload, static_cast<int>(length), retained, 1);
}

void Link::loop() {
  if (mqtt_) mqtt_->loop();
}

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
