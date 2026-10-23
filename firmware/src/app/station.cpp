#include "station.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <sys/time.h>
#include <time.h>

#include <algorithm>
#include <cstring>
#include <memory>

#include "core/command.h"
#include "core/config_trial.h"
#include "core/device_config.h"
#include "core/gust.h"
#include "core/local_form.h"
#include "core/payload.h"
#include "core/power_policy.h"
#include "core/reading_buffer.h"
#include "core/rtc_state.h"
#include "core/schedule.h"
#include "core/sensor_math.h"
#include "hw/battery.h"
#include "hw/climate_sensor.h"
#include "hw/led.h"
#include "hw/pulse_counter.h"
#include "hw/rtc_memory.h"
#include "net/link.h"
#include "net/local_page.h"
#include "net/portal.h"
#include "net/settings_store.h"

#ifndef FW_VERSION
#define FW_VERSION "dev"
#endif

namespace wx {

namespace {

constexpr uint32_t kBatteryCheckMs = 60'000;
constexpr uint32_t kWifiTimeoutMs = 15'000;
constexpr uint32_t kNtpTimeoutMs = 10'000;
/** A second reset within this window opens the configuration portal (design §4.5). */
constexpr uint32_t kDoubleResetWindowMs = 3'000;
/** Listening time of a short session for the retained config and queued commands. */
constexpr uint32_t kSessionListenMs = 1'500;
/** Without a successful publication: restart the Wi-Fi after 30 min, the ESP after 2 h. */
constexpr uint32_t kRestartWifiAfterMs = 30UL * 60'000;
constexpr uint32_t kRestartEspAfterMs = 2UL * 60 * 60'000;
constexpr uint32_t kBackoffMinMs = 5'000;
constexpr uint32_t kBackoffMaxMs = 5UL * 60'000;
/** Without settings after the portal: sleep and try again later (protects the battery). */
constexpr uint32_t kPortalRetrySleepS = 15 * 60;
constexpr uint32_t kIdentifyMs = 30'000;
constexpr uint32_t kSensorRetryMs = 10UL * 60'000;
constexpr uint8_t kSensorFailuresBeforeError = 3;
constexpr uint16_t kMaxDurationS = 3600;  // contract limit of `dur`
constexpr size_t kEventQueue = 8;

uint32_t epochNow() { return static_cast<uint32_t>(time(nullptr)); }

uint32_t millisIntoSecond() {
  timeval tv{};
  gettimeofday(&tv, nullptr);
  return static_cast<uint32_t>(tv.tv_usec / 1000);
}

bool reached(uint32_t deadlineMs) { return static_cast<int32_t>(millis() - deadlineMs) >= 0; }

void copyText(char* to, size_t capacity, const char* from) {
  strncpy(to, from, capacity - 1);
  to[capacity - 1] = '\0';
}

/** Another server or a new registration: it numbers its configuration revisions from 1 again. */
bool newRegistration(const MqttSettings& before, const MqttSettings& after) {
  return strcmp(before.host, after.host) != 0 || strcmp(before.code, after.code) != 0 ||
         strcmp(before.password, after.password) != 0;
}

/** The `next` of a `sleeping` status: unknown (null) while the clock is not set. */
uint32_t nextContactAt(uint32_t inS) {
  const uint32_t now = epochNow();
  return clockIsSet(now) ? now + inS : 0;
}

// Serial log for the bench test (115200 baud).
#define LOG(fmt, ...)                                         \
  do {                                                        \
    Serial.printf_P(PSTR("[wx] " fmt "\n"), ##__VA_ARGS__); \
  } while (0)

struct PendingEvent {
  EventLevel level = EventLevel::Info;
  char code[24] = {0};
  char message[112] = {0};
  char data[160] = {0};
  uint32_t ts = 0;
};

class StationApp {
 public:
  void setup();
  void loop();

 private:
  // Measuring.
  void scheduleIntervalEnd();
  void serviceSeconds();
  void closeInterval();
  ClimateReading readClimate();
  void serviceSensorRetry();

  // Power.
  void checkBattery();
  void storePolicy();
  void applyModeChange(PowerMode from, PowerMode to);
  [[noreturn]] void survivalCycle();
  [[noreturn]] void sleepFor(uint32_t seconds);

  // Network.
  bool openSession();
  void listen(uint32_t durationMs);
  void serviceNormalLink();
  void serviceEconomy();
  void runShortSession(uint32_t nextContactInS);
  void flushReadings();
  void flushEvents();
  bool publishHealth();
  bool publishStatus(LinkState state, uint32_t next);
  void checkWatchdogs();

  // Local configuration page (design §4.5).
  void serviceLocalPage();
  LocalPageView localView();
  void startTrial(const LocalForm& form);
  void keepTrial();
  void revertTrial(bool timedOut);

  // Remote configuration and commands.
  void processInbox();
  void handleConfig(const char* payload, size_t length);
  void handleCommand(const char* payload, size_t length);
  void acknowledge(const char* id, bool ok, const char* detail);

  // Events.
  void queueEvent(EventLevel level, const char* code, const char* message, const char* data = nullptr);
  void queueBootEvent();
  void queueModeChange(PowerMode from, PowerMode to);

  RtcState rtc_;
  bool freshRun_ = false;
  uint8_t resetReason_ = REASON_DEFAULT_RST;
  uint32_t doubleResetUntilMs_ = 0;

  MqttSettings settings_;
  DeviceConfig config_;
  uint32_t configRev_ = 0;
  uint32_t rejectedRev_ = 0;

  PowerPolicy policy_;
  uint16_t batteryMv_ = kNoBattery;
  uint32_t lastBatteryCheckMs_ = 0;
  bool modeChangePending_ = false;
  PowerMode pendingFrom_ = PowerMode::Normal;
  PowerMode pendingTo_ = PowerMode::Normal;

  ClimateSensorDevice climate_;
  SensorHealth climateHealth_ = SensorHealth::Absent;
  uint8_t climateFailures_ = 0;
  uint32_t lastSensorRetryMs_ = 0;

  PulseCounters pulses_;
  GustTracker gust_;
  uint32_t rainBase_ = 0;
  uint32_t lastSecondMs_ = 0;
  uint32_t intervalStartMs_ = 0;
  uint32_t intervalEndMs_ = 0;
  uint32_t intervalEndEpoch_ = 0;

  Link link_;
  StatusLed led_;
  bool announcedOnline_ = false;
  bool ntpFailureReported_ = false;
  uint32_t nextConnectAttemptMs_ = 0;
  uint32_t backoffMs_ = kBackoffMinMs;
  uint32_t lastHealthMs_ = 0;
  bool healthNow_ = false;
  bool statusNow_ = false;
  uint32_t lastPublishOkMs_ = 0;
  bool wifiRestarted_ = false;
  uint32_t nextSessionMs_ = 0;
  uint32_t rebootAtMs_ = 0;

  LocalPage localPage_;
  ConfigTrial trial_;
  /** Allocated only while a change from the local page waits to be applied or is on trial. */
  struct TrialState {
    LocalForm form;
    MqttSettings previousMqtt;
    char previousSsid[33] = {0};
    char previousPsk[65] = {0};
  };
  std::unique_ptr<TrialState> trialState_;
  uint32_t applyFormAtMs_ = 0;
  /** New server or credentials on trial: its own retained configuration waits until it is kept. */
  bool trialNewRegistration_ = false;
  LocalPageView::LastChange lastLocalChange_ = LocalPageView::LastChange::None;

  PendingEvent events_[kEventQueue];
  size_t eventHead_ = 0;
  size_t eventCount_ = 0;
};

ReadingBuffer buffer;  // ~5 KB: kept out of the stack
char payload[2400];    // telemetry batches (and the other messages) are built here

// ---- boot ----------------------------------------------------------------------------------

void StationApp::setup() {
  Serial.begin(115200);
  led_.begin();
  const rst_info* reset = ESP.getResetInfoPtr();
  resetReason_ = reset != nullptr ? static_cast<uint8_t>(reset->reason)
                                  : static_cast<uint8_t>(REASON_DEFAULT_RST);

  const bool rtcValid = loadRtcState(rtc_);
  if (!rtcValid) rtc_ = freshState(ESP.random());  // power was lost: new run, counters restart
  freshRun_ = !rtcValid;

  // Two resets within 3 s open the portal (the D1 mini has no FLASH button).
  const bool portalRequested = resetReason_ == REASON_EXT_SYS_RST && rtcValid && rtc_.resetArmed;
  rtc_.resetArmed = portalRequested ? 0 : 1;
  saveRtcState(rtc_);
  doubleResetUntilMs_ = millis() + kDoubleResetWindowMs;
  LOG("firmware %s, reset %s, run %u", FW_VERSION, ESP.getResetReason().c_str(), rtc_.run);

  mountStorage();
  loadDeviceConfig(config_, configRev_);
  const bool configured = loadMqttSettings(settings_);
  if (portalRequested || !configured) {
    LOG("portal de configuração aberto: %s (heap livre %u, maior bloco %u)", portalName().c_str(),
        static_cast<unsigned>(ESP.getFreeHeap()), static_cast<unsigned>(ESP.getMaxFreeBlockSize()));
    const MqttSettings before = settings_;
    if (!runConfigPortal(settings_) && !settings_.complete()) sleepFor(kPortalRetrySleepS);
    if (newRegistration(before, settings_)) {
      // From the bench to production, say: forget the configuration revision applied here.
      forgetDeviceConfig();
      config_ = DeviceConfig{};
      configRev_ = 0;
    }
  }
  link_.begin(settings_);
  LOG("servidor MQTT %s:%u %s, estação %s", settings_.host, settings_.port,
      settings_.tls ? "com TLS" : "sem TLS", settings_.code);

  batteryMv_ = readBatteryMillivolts(config_.batFullScaleMv);
  const bool wokeFromSleep = resetReason_ == REASON_DEEP_SLEEP_AWAKE && rtcValid;
  if (wokeFromSleep) {
    // Deep sleep is a reset: the profile and its hysteresis come back from RTC memory.
    policy_ = PowerPolicy(static_cast<PowerMode>(rtc_.mode), static_cast<PowerMode>(rtc_.candidate), rtc_.streak);
    const PowerMode before = policy_.mode();
    if (policy_.update(batteryMv_, config_.powerMode, config_.thresholds())) {
      queueModeChange(before, policy_.mode());
    }
  } else {
    policy_ = PowerPolicy(bootPowerMode(batteryMv_, config_.powerMode, config_.thresholds()));
    queueBootEvent();
  }
  storePolicy();

  const ClimateSensor sensor = climate_.detect();
  climateHealth_ = sensor == ClimateSensor::None ? SensorHealth::Absent : SensorHealth::Ok;
  LOG("sensor de clima: %s, bateria %u mV, perfil %s", climateSensorName(sensor), batteryMv_,
      powerModeName(policy_.mode()));

  // Below the brownout voltage the radio stays off (design §4.3).
  if (batteryMv_ != kNoBattery && batteryMv_ < kBrownoutMv) sleepFor(config_.survivalSleepS);
  if (policy_.mode() == PowerMode::Survival) survivalCycle();

  rainBase_ = rtc_.rainCount;
  pulses_.begin(config_.rainEdge);
  lastSecondMs_ = millis();
  intervalStartMs_ = millis();
  lastBatteryCheckMs_ = millis();
  lastPublishOkMs_ = millis();
  scheduleIntervalEnd();
  // Economy also talks right away once, to announce itself and fetch the configuration.
  nextSessionMs_ = millis();
}

void StationApp::loop() {
  if (doubleResetUntilMs_ != 0 && reached(doubleResetUntilMs_)) {
    rtc_.resetArmed = 0;
    saveRtcState(rtc_);
    doubleResetUntilMs_ = 0;
  }
  serviceSeconds();
  if (reached(intervalEndMs_)) closeInterval();
  if (millis() - lastBatteryCheckMs_ >= kBatteryCheckMs) checkBattery();
  serviceSensorRetry();
  led_.loop();

  // A new profile (battery or remote configuration) takes effect before the link is serviced.
  if (modeChangePending_) {
    modeChangePending_ = false;
    applyModeChange(pendingFrom_, pendingTo_);
  }
  if (policy_.mode() == PowerMode::Normal) {
    serviceNormalLink();
  } else {
    serviceEconomy();
  }
  serviceLocalPage();
  if (rebootAtMs_ != 0 && reached(rebootAtMs_)) {
    link_.mqttDisconnect();
    ESP.restart();
  }
  delay(10);  // lets the Wi-Fi modem sleep between loops
}

// ---- measuring -----------------------------------------------------------------------------

void StationApp::scheduleIntervalEnd() {
  const uint32_t now = epochNow();
  const uint32_t intervalMs = static_cast<uint32_t>(config_.intervalS) * 1000;
  if (clockIsSet(now)) {
    // Intervals close on the wall clock (second 0 of each minute and so on).
    intervalEndEpoch_ = nextBoundary(now, config_.intervalS);
    uint32_t wait = millisUntil(intervalEndEpoch_, now, millisIntoSecond());
    if (wait < 5'000) {
      intervalEndEpoch_ += config_.intervalS;
      wait += intervalMs;
    }
    intervalEndMs_ = millis() + wait;
  } else {
    intervalEndEpoch_ = 0;
    intervalEndMs_ = millis() + intervalMs;
  }
}

void StationApp::serviceSeconds() {
  const uint32_t elapsed = millis() - lastSecondMs_;
  if (elapsed < 1000) return;
  const uint32_t seconds = elapsed / 1000;
  lastSecondMs_ += seconds * 1000;
  const uint32_t pulses = pulses_.takeWindPulses();
  // A long blocking call (a TLS handshake) spreads its pulses over the seconds it took, so it
  // does not invent a gust.
  for (uint32_t i = 0; i < seconds; i++) {
    gust_.addSecond(pulses / seconds + (i < pulses % seconds ? 1 : 0));
  }
  const uint32_t rain = rainBase_ + pulses_.rainPulses();
  if (rain != rtc_.rainCount) {
    rtc_.rainCount = rain;  // survives a reset: the counter is cumulative within the run
    saveRtcState(rtc_);
  }
}

void StationApp::closeInterval() {
  serviceSeconds();
  Reading reading;
  reading.seq = ++rtc_.seq;
  reading.endMs = millis();
  const uint32_t now = epochNow();
  if (clockIsSet(now)) reading.ts = intervalEndEpoch_ != 0 ? intervalEndEpoch_ : now;
  const uint32_t durationS = (reading.endMs - intervalStartMs_ + 500) / 1000;
  reading.dur = static_cast<uint16_t>(std::min<uint32_t>(std::max<uint32_t>(durationS, 1), kMaxDurationS));

  const ClimateReading climate = readClimate();
  reading.temp = climate.temperatureC;
  reading.hum = climate.humidityPct;
  reading.pres = climate.pressureHpa;
  reading.windPulses = gust_.total();
  reading.gustPulses = gust_.gust();
  reading.rainCount = rtc_.rainCount;

  if (buffer.push(reading)) {
    rtc_.dropped++;
    if (rtc_.dropped == 1 || rtc_.dropped % 30 == 0) {
      char data[48];
      snprintf(data, sizeof(data), "{\"dropped\":%u}", rtc_.dropped);
      queueEvent(EventLevel::Warn, "BUFFER_OVERFLOW", "Buffer cheio: leituras antigas descartadas", data);
    }
  }
  saveRtcState(rtc_);
  gust_.reset();
  intervalStartMs_ = reading.endMs;
  scheduleIntervalEnd();
}

ClimateReading StationApp::readClimate() {
  if (climate_.kind() == ClimateSensor::None) return {};
  const ClimateReading reading = climate_.read();
  const char* name = climateSensorName(climate_.kind());
  char data[40];
  snprintf(data, sizeof(data), "{\"sensor\":\"%s\"}", name);
  if (reading.ok) {
    climateFailures_ = 0;
    if (climateHealth_ == SensorHealth::Error) {
      climateHealth_ = SensorHealth::Ok;
      queueEvent(EventLevel::Info, "SENSOR_RECOVERED", "Sensor de clima voltou a responder", data);
    }
  } else if (++climateFailures_ >= kSensorFailuresBeforeError && climateHealth_ != SensorHealth::Error) {
    climateHealth_ = SensorHealth::Error;
    queueEvent(EventLevel::Error, "SENSOR_FAILED", "Sensor de clima não respondeu", data);
  }
  return reading;
}

void StationApp::serviceSensorRetry() {
  // A loose wire at start-up: look for the sensor again every 10 minutes.
  if (climate_.kind() != ClimateSensor::None || millis() - lastSensorRetryMs_ < kSensorRetryMs) return;
  lastSensorRetryMs_ = millis();
  if (climate_.detect() != ClimateSensor::None) climateHealth_ = SensorHealth::Ok;
}

// ---- power ---------------------------------------------------------------------------------

void StationApp::checkBattery() {
  lastBatteryCheckMs_ = millis();
  batteryMv_ = readBatteryMillivolts(config_.batFullScaleMv);
  const PowerMode before = policy_.mode();
  if (policy_.update(batteryMv_, config_.powerMode, config_.thresholds())) {
    queueModeChange(before, policy_.mode());
    modeChangePending_ = true;
    pendingFrom_ = before;
    pendingTo_ = policy_.mode();
  }
  storePolicy();
}

void StationApp::storePolicy() {
  rtc_.mode = static_cast<uint8_t>(policy_.mode());
  rtc_.candidate = static_cast<uint8_t>(policy_.candidate());
  rtc_.streak = policy_.streak();
  saveRtcState(rtc_);
}

void StationApp::applyModeChange(PowerMode from, PowerMode to) {
  LOG("perfil de energia: %s -> %s", powerModeName(from), powerModeName(to));
  if (to != PowerMode::Normal) {
    // Away from Normal the Wi-Fi sleeps: no local page, and a change on trial is undone.
    if (trial_.active()) revertTrial(false);
    applyFormAtMs_ = 0;
    trialState_.reset();
    localPage_.stop();
  }
  if (to == PowerMode::Survival) {
    // Last chance to send what is buffered: wind and rain stop being counted while asleep.
    if (link_.mqttConnected() || openSession()) {
      flushEvents();
      flushReadings();
      publishStatus(LinkState::Sleeping, nextContactAt(config_.survivalSleepS));
      link_.mqttDisconnect();
    }
    if (!buffer.empty()) rtc_.dropped += static_cast<uint32_t>(buffer.size());
    sleepFor(config_.survivalSleepS);
  }
  if (from == PowerMode::Normal && to == PowerMode::Economy) {
    if (link_.mqttConnected()) {
      flushEvents();
      flushReadings();
      publishStatus(LinkState::Sleeping, nextContactAt(config_.economyBatchS));
      link_.mqttDisconnect();
    }
    link_.wifiOff();
    nextSessionMs_ = millis() + static_cast<uint32_t>(config_.economyBatchS) * 1000;
  }
  if (to == PowerMode::Normal) {
    nextConnectAttemptMs_ = millis();
    backoffMs_ = kBackoffMinMs;
  }
}

void StationApp::survivalCycle() {
  // Wake-up reading: temperature, humidity and pressure. Wind and rain are not counted while
  // asleep, so they go as null (design §4.3).
  Reading reading;
  reading.seq = ++rtc_.seq;
  reading.dur = static_cast<uint16_t>(std::min<uint32_t>(rtc_.sleepS != 0 ? rtc_.sleepS : config_.survivalSleepS,
                                                         kMaxDurationS));
  const ClimateReading climate = readClimate();
  // Every wake-up is a fresh boot, so the failure count never builds up: one failed reading
  // already marks the sensor as failing in the diagnosis.
  if (!climate.ok && climate_.kind() != ClimateSensor::None) climateHealth_ = SensorHealth::Error;
  reading.temp = climate.temperatureC;
  reading.hum = climate.humidityPct;
  reading.pres = climate.pressureHpa;
  // Estimated from the time the station went to sleep; corrected below when NTP answers.
  const bool estimable = resetReason_ == REASON_DEEP_SLEEP_AWAKE && rtc_.sleepStartEpoch != 0;
  const uint32_t estimate = estimable ? rtc_.sleepStartEpoch + rtc_.sleepS + millis() / 1000 : 0;
  reading.ts = clockIsSet(estimate) ? estimate : 0;
  if (rtc_.pendingCount == RtcState::kPendingCapacity) {
    memmove(&rtc_.pending[0], &rtc_.pending[1], sizeof(PackedReading) * (RtcState::kPendingCapacity - 1));
    rtc_.pendingCount--;
    rtc_.dropped++;
  }
  rtc_.pending[rtc_.pendingCount++] = pack(reading);
  saveRtcState(rtc_);

  if (openSession()) {
    const uint32_t now = epochNow();
    if (clockIsSet(now)) rtc_.pending[rtc_.pendingCount - 1].ts = now - millis() / 1000;
    publishStatus(LinkState::Online, 0);
    listen(kSessionListenMs);

    // Readings that could never be dated cannot be sent (the server needs the time).
    ReadingBuffer pending;
    for (uint8_t i = 0; i < rtc_.pendingCount; i++) {
      if (rtc_.pending[i].ts != 0) pending.push(unpack(rtc_.pending[i]));
    }
    const TelemetryBatch batch = writeTelemetry(pending, rtc_.run, payload, sizeof(payload));
    if (batch.readings > 0 && link_.publish("telemetry", payload, batch.length, false)) {
      rtc_.pendingCount = 0;
    }
    flushEvents();
    publishHealth();
    publishStatus(LinkState::Sleeping, nextContactAt(config_.survivalSleepS));
    link_.mqttDisconnect();
  }
  link_.wifiOff();

  if (policy_.mode() != PowerMode::Survival) {
    // The battery recovered: start over in the new profile.
    storePolicy();
    ESP.restart();
  }
  sleepFor(config_.survivalSleepS);
}

void StationApp::sleepFor(uint32_t seconds) {
  rtc_.resetArmed = 0;
  rtc_.sleepStartEpoch = clockIsSet(epochNow()) ? epochNow() : 0;
  rtc_.sleepS = seconds;
  storePolicy();
  uint64_t us = static_cast<uint64_t>(seconds) * 1'000'000ULL;
  us = std::min<uint64_t>(us, ESP.deepSleepMax());
  LOG("dormindo por %u s", seconds);
  // Waking up needs D0 wired to RST.
  ESP.deepSleep(us, WAKE_RF_DEFAULT);
  while (true) delay(100);
}

// ---- network -------------------------------------------------------------------------------

bool StationApp::openSession() {
  if (!link_.wifiUp(rtc_, kWifiTimeoutMs)) {
    LOG("Wi-Fi indisponível");
    return false;
  }
  const bool hadClock = clockIsSet(epochNow());
  if (!link_.syncClock(kNtpTimeoutMs)) {
    if (!ntpFailureReported_) {
      LOG("NTP sem resposta: relógio não sincronizado");
      queueEvent(EventLevel::Warn, "NTP_FAILED", "Relógio não sincronizado (NTP sem resposta)");
      ntpFailureReported_ = true;
    }
  } else if (!hadClock) {
    LOG("relógio sincronizado pelo NTP");
    // Readings taken before the clock was set get their time now; intervals align to it.
    buffer.fixTimestamps(epochNow(), millis());
    scheduleIntervalEnd();
  }
  if (!link_.mqttConnect()) {
    // Where it tried to go and from where: enough to tell the network from the credentials.
    LOG("MQTT falhou com %s:%u (erro %d, código %d); IP %s, gateway %s, sinal %d dBm", settings_.host,
        settings_.port, link_.mqttError(), link_.mqttReturnCode(), WiFi.localIP().toString().c_str(),
        WiFi.gatewayIP().toString().c_str(), static_cast<int>(WiFi.RSSI()));
    return false;
  }
  LOG("MQTT conectado a %s:%u", settings_.host, settings_.port);
  announcedOnline_ = false;
  return true;
}

void StationApp::listen(uint32_t durationMs) {
  const uint32_t until = millis() + durationMs;
  while (!reached(until) && link_.mqttConnected()) {
    link_.loop();
    processInbox();
    delay(10);
  }
}

void StationApp::serviceNormalLink() {
  if (!link_.mqttConnected()) {
    if (!reached(nextConnectAttemptMs_)) {
      checkWatchdogs();
      return;
    }
    if (!openSession()) {
      nextConnectAttemptMs_ = millis() + backoffMs_;
      backoffMs_ = std::min(backoffMs_ * 2, kBackoffMaxMs);
      checkWatchdogs();
      return;
    }
    backoffMs_ = kBackoffMinMs;
  }
  link_.loop();
  processInbox();
  if (!announcedOnline_ || statusNow_) {
    // After each (re)connection: status, then the diagnosis (design §3.5).
    announcedOnline_ = publishStatus(LinkState::Online, 0);
    statusNow_ = false;
    healthNow_ = true;
  }
  if (healthNow_ || millis() - lastHealthMs_ >= config_.healthS * 1000UL) {
    healthNow_ = !publishHealth();
  }
  flushEvents();
  flushReadings();
  checkWatchdogs();
}

void StationApp::serviceEconomy() {
  if (!reached(nextSessionMs_)) return;
  runShortSession(config_.economyBatchS);
  nextSessionMs_ = millis() + static_cast<uint32_t>(config_.economyBatchS) * 1000;
  // Sessions failing for hours: a fresh start is the last resort here too.
  if (millis() - lastPublishOkMs_ > kRestartEspAfterMs) {
    LOG("2 h sem publicar: reiniciando");
    ESP.restart();
  }
}

void StationApp::runShortSession(uint32_t nextContactInS) {
  // Economy: connect, deliver the buffer in batches, fetch config and commands, announce the
  // next contact and switch the radio off again (design §4.3).
  if (openSession()) {
    publishStatus(LinkState::Online, 0);
    listen(kSessionListenMs);
    flushEvents();
    flushReadings();
    publishHealth();
    flushEvents();
    // A new profile from the configuration just received takes over the open connection.
    if (!modeChangePending_) {
      publishStatus(LinkState::Sleeping, nextContactAt(nextContactInS));
      link_.mqttDisconnect();
    }
  }
  if (!link_.mqttConnected()) link_.wifiOff();
}

void StationApp::flushReadings() {
  while (!buffer.empty() && link_.mqttConnected()) {
    if (buffer.frontUndated()) {
      if (!clockIsSet(epochNow())) return;
      buffer.fixTimestamps(epochNow(), millis());
    }
    const TelemetryBatch batch = writeTelemetry(buffer, rtc_.run, payload, sizeof(payload));
    if (batch.readings == 0) return;
    // QoS 1: the readings leave the buffer only after the broker's PUBACK.
    if (!link_.publish("telemetry", payload, batch.length, false)) return;
    buffer.dropFront(batch.readings);
    lastPublishOkMs_ = millis();
    wifiRestarted_ = false;
  }
}

void StationApp::flushEvents() {
  while (eventCount_ > 0 && link_.mqttConnected()) {
    const PendingEvent& event = events_[eventHead_];
    // Queued before the clock was set: the time goes as null and the server keeps the arrival.
    const size_t length = writeEvent(event.level, event.code, event.message,
                                     event.data[0] != '\0' ? event.data : nullptr, event.ts, payload,
                                     sizeof(payload));
    if (length == 0 || !link_.publish("event", payload, length, false)) return;
    eventHead_ = (eventHead_ + 1) % kEventQueue;
    eventCount_--;
  }
}

bool StationApp::publishHealth() {
  HealthInfo health;
  health.ts = clockIsSet(epochNow()) ? epochNow() : 0;
  health.fw = FW_VERSION;
  health.mode = policy_.mode();
  health.batteryMv = batteryMv_;
  health.rssi = link_.rssi();
  health.heap = ESP.getFreeHeap();
  health.heapFrag = ESP.getHeapFragmentation();
  health.uptimeS = millis() / 1000;
  const String reset = ESP.getResetReason();
  health.reset = reset.c_str();
  health.wifiReconnects = link_.wifiReconnects();
  health.mqttReconnects = link_.mqttReconnects();
  health.buffered = static_cast<uint16_t>(buffer.size() + rtc_.pendingCount);
  health.dropped = rtc_.dropped;
  health.climate = climate_.kind();
  health.climateHealth = climateHealth_;
  health.cfgRev = configRev_;
  const String ip = link_.wifiConnected() ? WiFi.localIP().toString() : String();
  health.ip = ip.c_str();
  const size_t length = writeHealth(health, payload, sizeof(payload));
  if (length == 0 || !link_.publish("health", payload, length, false)) return false;
  lastHealthMs_ = millis();
  lastPublishOkMs_ = millis();
  return true;
}

bool StationApp::publishStatus(LinkState state, uint32_t next) {
  StatusInfo status;
  status.state = state;
  status.ts = clockIsSet(epochNow()) ? epochNow() : 0;
  status.mode = policy_.mode();
  status.next = next;
  status.fw = FW_VERSION;
  const size_t length = writeStatus(status, payload, sizeof(payload));
  return length > 0 && link_.publish("status", payload, length, true);
}

void StationApp::checkWatchdogs() {
  const uint32_t silentMs = millis() - lastPublishOkMs_;
  if (silentMs > kRestartEspAfterMs) {
    LOG("2 h sem publicar: reiniciando");
    ESP.restart();
  }
  if (silentMs > kRestartWifiAfterMs && !wifiRestarted_) {
    LOG("30 min sem publicar: reiniciando o Wi-Fi");
    link_.wifiOff();
    wifiRestarted_ = true;
    nextConnectAttemptMs_ = millis();
  }
}

// ---- local configuration page ---------------------------------------------------------------

void StationApp::serviceLocalPage() {
  if (policy_.mode() != PowerMode::Normal) return;
  if (!localPage_.running() && link_.wifiConnected()) {
    localPage_.begin(
        // The dashboard's password once it arrives in the configuration; the portal's until then.
        [this] { return config_.localPassword[0] != '\0' ? config_.localPassword : portalPassword(); },
        [this] { return localView(); },
        [this](const LocalForm& form) {
          trialState_ = std::make_unique<TrialState>();
          trialState_->form = form;
          applyFormAtMs_ = millis() + 1'000;  // after the answer has left
        },
        [this] { rebootAtMs_ = millis() + 1'000; });
    LOG("página local: http://%s (usuário admin)", WiFi.localIP().toString().c_str());
  }
  localPage_.loop();
  if (applyFormAtMs_ != 0 && reached(applyFormAtMs_)) {
    applyFormAtMs_ = 0;
    startTrial(trialState_->form);
  }
  switch (trial_.update(millis(), link_.wifiConnected(), link_.mqttConnected())) {
    case ConfigTrial::Outcome::Kept:
      keepTrial();
      break;
    case ConfigTrial::Outcome::Reverted:
      revertTrial(true);
      break;
    default:
      break;
  }
}

LocalPageView StationApp::localView() {
  LocalPageView view;
  view.code = settings_.code;
  view.host = settings_.host;
  view.port = settings_.port;
  view.tls = settings_.tls;
  view.mqttConnected = link_.mqttConnected();
  view.mqttError = link_.mqttError();
  view.mqttReturnCode = link_.mqttReturnCode();
  view.firmware = FW_VERSION;
  view.trialSecondsLeft = trial_.secondsLeft(millis());
  view.changePending = applyFormAtMs_ != 0 || trial_.active();
  view.lastChange = lastLocalChange_;
  return view;
}

void StationApp::startTrial(const LocalForm& form) {
  MqttSettings next = settings_;
  copyText(next.host, sizeof(next.host), form.host);
  next.port = form.port;
  next.tls = form.tls;
  copyText(next.code, sizeof(next.code), form.code);
  if (form.password[0] != '\0') copyText(next.password, sizeof(next.password), form.password);
  const bool serverChanged =
      newRegistration(settings_, next) || next.port != settings_.port || next.tls != settings_.tls;
  const String ssid = WiFi.SSID();
  const String psk = WiFi.psk();
  const bool wifiChanged = form.ssid[0] != '\0' && (ssid != form.ssid || psk != form.wifiPassword);
  if (!serverChanged && !wifiChanged) {
    LOG("página local: nada mudou");
    trialState_.reset();
    return;
  }

  trialState_->previousMqtt = settings_;
  copyText(trialState_->previousSsid, sizeof(trialState_->previousSsid), ssid.c_str());
  copyText(trialState_->previousPsk, sizeof(trialState_->previousPsk), psk.c_str());
  trialNewRegistration_ = newRegistration(settings_, next);
  trial_.start(millis(), wifiChanged, serverChanged);
  lastLocalChange_ = LocalPageView::LastChange::None;
  if (serverChanged) {
    settings_ = next;
    link_.reconfigure(settings_);
  }
  if (wifiChanged) {
    // Only in RAM (persistent off): a restart during the trial comes back on the old network.
    link_.mqttDisconnect();
    rtc_.wifiChannel = 0;  // the fast-reconnect hint belongs to the old network
    WiFi.disconnect();
    WiFi.begin(form.ssid, form.wifiPassword);
  }
  nextConnectAttemptMs_ = millis();
  backoffMs_ = kBackoffMinMs;
  LOG("página local: testando %s por até 2 min",
      wifiChanged && serverChanged ? "o servidor e a rede Wi-Fi"
      : wifiChanged                ? "a rede Wi-Fi"
                                   : "o servidor");
}

void StationApp::keepTrial() {
  if (trial_.serverChanged()) {
    saveMqttSettings(settings_);
    if (trialNewRegistration_) {
      // Its retained configuration was held back during the trial: start from the defaults and
      // fetch it again on the next subscription.
      forgetDeviceConfig();
      config_ = DeviceConfig{};
      configRev_ = 0;
      pulses_.setRainEdge(config_.rainEdge);
      scheduleIntervalEnd();
      link_.mqttDisconnect();
      nextConnectAttemptMs_ = millis();
    }
  }
  if (trial_.wifiChanged()) link_.saveWifi();
  trialNewRegistration_ = false;
  lastLocalChange_ = LocalPageView::LastChange::Kept;
  char data[48];
  snprintf(data, sizeof(data), "{\"wifi\":%s,\"server\":%s}", trial_.wifiChanged() ? "true" : "false",
           trial_.serverChanged() ? "true" : "false");
  queueEvent(EventLevel::Info, "LOCAL_CONFIG_APPLIED", "Configuração alterada pela página local", data);
  LOG("página local: alteração mantida");
  trialState_.reset();
}

void StationApp::revertTrial(bool timedOut) {
  trial_.cancel();
  if (trial_.serverChanged()) {
    settings_ = trialState_->previousMqtt;
    link_.reconfigure(settings_);
  }
  if (trial_.wifiChanged()) {
    link_.mqttDisconnect();
    rtc_.wifiChannel = 0;
    WiFi.disconnect();
    WiFi.begin(trialState_->previousSsid, trialState_->previousPsk);
  }
  trialNewRegistration_ = false;
  nextConnectAttemptMs_ = millis();
  backoffMs_ = kBackoffMinMs;
  lastLocalChange_ = LocalPageView::LastChange::Reverted;
  char data[48];
  snprintf(data, sizeof(data), "{\"wifi\":%s,\"server\":%s}", trial_.wifiChanged() ? "true" : "false",
           trial_.serverChanged() ? "true" : "false");
  queueEvent(EventLevel::Warn, "LOCAL_CONFIG_REVERTED",
             timedOut ? "Configuração da página local desfeita: não conectou em 2 minutos"
                      : "Configuração da página local desfeita: o perfil de energia saiu do Normal",
             data);
  LOG("página local: alteração desfeita (%s)", timedOut ? "não conectou em 2 min" : "perfil de energia");
  trialState_.reset();
}

// ---- remote configuration and commands -----------------------------------------------------

void StationApp::processInbox() {
  static InboxMessage message;  // 512 bytes: not on the stack
  while (link_.takeMessage(message)) {
    if (message.kind == InboxMessage::Kind::Config) {
      handleConfig(message.payload, message.length);
    } else {
      handleCommand(message.payload, message.length);
    }
  }
}

void StationApp::handleConfig(const char* json, size_t length) {
  if (trial_.active() && trialNewRegistration_) return;
  const ConfigParse parsed = parseConfig(json, length);
  // The configuration is retained: it comes back on every connection.
  if (parsed.rev == 0 || parsed.rev <= configRev_) return;
  char data[160];
  if (!parsed.ok) {
    if (parsed.rev != rejectedRev_) {
      rejectedRev_ = parsed.rev;
      snprintf(data, sizeof(data), "{\"rev\":%u,\"reason\":\"%s\"}", parsed.rev, parsed.reason);
      queueEvent(EventLevel::Warn, "CONFIG_REJECTED", "Configuração recusada", data);
    }
    return;
  }

  const DeviceConfig previous = config_;
  config_ = parsed.config;
  configRev_ = parsed.rev;
  saveDeviceConfig(config_, configRev_);
  if (previous.rainEdge != config_.rainEdge) pulses_.setRainEdge(config_.rainEdge);
  if (previous.intervalS != config_.intervalS) scheduleIntervalEnd();
  if (config_.powerMode != PowerConfigMode::Auto) {
    // A fixed profile applies at once; `auto` keeps following the battery measurements.
    const PowerMode before = policy_.mode();
    if (policy_.update(batteryMv_, config_.powerMode, config_.thresholds())) {
      queueModeChange(before, policy_.mode());
      modeChangePending_ = true;
      pendingFrom_ = before;
      pendingTo_ = policy_.mode();
    }
    storePolicy();
  }
  snprintf(data, sizeof(data), "{\"rev\":%u}", configRev_);
  queueEvent(EventLevel::Info, "CONFIG_APPLIED", "Configuração aplicada", data);
  LOG("configuração rev %u aplicada", configRev_);
}

void StationApp::handleCommand(const char* json, size_t length) {
  const CommandParse parsed = parseCommand(json, length);
  if (!parsed.hasId) return;
  // QoS 1 may deliver a command twice (always after a reboot): run each one only once.
  if (rtc_.commands.seen(parsed.command.id)) return;
  rtc_.commands.remember(parsed.command.id);
  saveRtcState(rtc_);

  if (!parsed.ok) {
    acknowledge(parsed.command.id, false, parsed.reason);
    return;
  }
  const uint32_t now = epochNow();
  if (clockIsSet(now) && isExpired(parsed.command, now)) {
    acknowledge(parsed.command.id, false, "expired");
    return;
  }
  switch (parsed.command.kind) {
    case CommandKind::Reboot:
      acknowledge(parsed.command.id, true, "reiniciando");
      // After the acknowledgement leaves (and the PUBACK of the command).
      rebootAtMs_ = millis() + 2'000;
      break;
    case CommandKind::Identify:
      if (policy_.mode() == PowerMode::Survival) {
        // The station goes back to deep sleep right away: nothing would blink.
        acknowledge(parsed.command.id, false, "indisponível no perfil Sobrevivência");
        break;
      }
      led_.identify(kIdentifyMs);
      acknowledge(parsed.command.id, true, "LED piscando por 30 s");
      break;
    case CommandKind::Flush:
      statusNow_ = true;
      acknowledge(parsed.command.id, true, nullptr);
      flushReadings();
      break;
    case CommandKind::Health:
      acknowledge(parsed.command.id, true, nullptr);
      healthNow_ = !publishHealth();
      break;
  }
}

void StationApp::acknowledge(const char* id, bool ok, const char* detail) {
  char data[160];
  if (detail != nullptr) {
    snprintf(data, sizeof(data), "{\"id\":\"%s\",\"ok\":%s,\"detail\":\"%s\"}", id, ok ? "true" : "false", detail);
  } else {
    snprintf(data, sizeof(data), "{\"id\":\"%s\",\"ok\":%s}", id, ok ? "true" : "false");
  }
  queueEvent(EventLevel::Info, "CMD_ACK", ok ? "Comando executado" : "Comando recusado", data);
  flushEvents();
}

// ---- events --------------------------------------------------------------------------------

void StationApp::queueEvent(EventLevel level, const char* code, const char* message, const char* data) {
  if (eventCount_ == kEventQueue) {
    eventHead_ = (eventHead_ + 1) % kEventQueue;  // keep the newest
    eventCount_--;
  }
  PendingEvent& event = events_[(eventHead_ + eventCount_) % kEventQueue];
  event = PendingEvent{};
  event.level = level;
  strncpy(event.code, code, sizeof(event.code) - 1);
  strncpy(event.message, message, sizeof(event.message) - 1);
  if (data != nullptr) strncpy(event.data, data, sizeof(event.data) - 1);
  event.ts = clockIsSet(epochNow()) ? epochNow() : 0;
  eventCount_++;
}

void StationApp::queueBootEvent() {
  char data[160];
  snprintf(data, sizeof(data), "{\"reset\":\"%s\",\"fw\":\"%s\"}", ESP.getResetReason().c_str(), FW_VERSION);
  queueEvent(EventLevel::Info, "BOOT", freshRun_ ? "Estação iniciada após falta de energia" : "Estação iniciada",
             data);
}

void StationApp::queueModeChange(PowerMode from, PowerMode to) {
  char data[96];
  snprintf(data, sizeof(data), "{\"from\":\"%s\",\"to\":\"%s\",\"bat_mv\":%u}", powerModeName(from),
           powerModeName(to), batteryMv_);
  char message[96];
  snprintf(message, sizeof(message), "Perfil de energia: %s -> %s", powerModeName(from), powerModeName(to));
  queueEvent(EventLevel::Info, "MODE_CHANGED", message, data);
}

StationApp app;

}  // namespace

void stationSetup() { app.setup(); }
void stationLoop() { app.loop(); }

}  // namespace wx
