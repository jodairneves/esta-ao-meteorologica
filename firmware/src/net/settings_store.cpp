#include "settings_store.h"

#include <ArduinoJson.h>
#include <LittleFS.h>

#include <cstring>

namespace wx {

namespace {

constexpr const char* kMqttPath = "/mqtt.json";
constexpr const char* kConfigPath = "/config.json";

bool readFile(const char* path, char* out, size_t capacity, size_t& length) {
  File file = LittleFS.open(path, "r");
  if (!file) return false;
  length = file.readBytes(out, capacity - 1);
  out[length] = '\0';
  file.close();
  return length > 0;
}

bool writeFile(const char* path, const char* data, size_t length) {
  // Write to a temporary file and rename: a power cut never leaves half a file behind.
  const String temporary = String(path) + ".tmp";
  File file = LittleFS.open(temporary, "w");
  if (!file) return false;
  const size_t written = file.write(reinterpret_cast<const uint8_t*>(data), length);
  file.close();
  if (written != length) return false;
  LittleFS.remove(path);
  return LittleFS.rename(temporary, path);
}

void copy(char* to, size_t capacity, const char* from) {
  strncpy(to, from ? from : "", capacity - 1);
  to[capacity - 1] = '\0';
}

}  // namespace

bool MqttSettings::complete() const {
  return host[0] != '\0' && port != 0 && isValidStationCode(code) && password[0] != '\0';
}

bool mountStorage() {
  if (LittleFS.begin()) return true;
  // First boot of a new board: the filesystem has never been created.
  return LittleFS.format() && LittleFS.begin();
}

bool loadMqttSettings(MqttSettings& settings) {
  char buffer[384];
  size_t length = 0;
  if (!readFile(kMqttPath, buffer, sizeof(buffer), length)) return false;
  JsonDocument doc;
  if (deserializeJson(doc, buffer, length) != DeserializationError::Ok) return false;
  copy(settings.host, sizeof(settings.host), doc["host"] | "");
  settings.port = doc["port"] | 8883;
  settings.tls = doc["tls"] | true;
  copy(settings.code, sizeof(settings.code), doc["code"] | "");
  copy(settings.password, sizeof(settings.password), doc["password"] | "");
  return settings.complete();
}

bool saveMqttSettings(const MqttSettings& settings) {
  JsonDocument doc;
  doc["host"] = settings.host;
  doc["port"] = settings.port;
  doc["tls"] = settings.tls;
  doc["code"] = settings.code;
  doc["password"] = settings.password;
  char buffer[384];
  const size_t length = serializeJson(doc, buffer, sizeof(buffer));
  return length > 0 && writeFile(kMqttPath, buffer, length);
}

bool loadDeviceConfig(DeviceConfig& config, uint32_t& rev) {
  char buffer[512];
  size_t length = 0;
  config = DeviceConfig{};
  rev = 0;
  if (!readFile(kConfigPath, buffer, sizeof(buffer), length)) return false;
  const ConfigParse parsed = parseConfig(buffer, length);
  if (!parsed.ok) return false;
  config = parsed.config;
  rev = parsed.rev;
  return true;
}

bool saveDeviceConfig(const DeviceConfig& config, uint32_t rev) {
  char buffer[512];
  const size_t length = writeConfig(config, rev, buffer, sizeof(buffer));
  return length > 0 && writeFile(kConfigPath, buffer, length);
}

void forgetDeviceConfig() { LittleFS.remove(kConfigPath); }

}  // namespace wx
