#include "device_config.h"

#include <ArduinoJson.h>

#include <cstdio>
#include <cstring>

namespace wx {

namespace {

/** Reads an integer field and checks its range; fills `reason` on failure. */
bool readInt(JsonVariantConst value, const char* name, long min, long max, long& out, ConfigParse& result) {
  if (!value.is<long>()) {
    snprintf(result.reason, sizeof(result.reason), "%s ausente ou não é inteiro", name);
    return false;
  }
  const long number = value.as<long>();
  if (number < min || number > max) {
    snprintf(result.reason, sizeof(result.reason), "%s fora da faixa %ld a %ld", name, min, max);
    return false;
  }
  out = number;
  return true;
}

}  // namespace

ConfigParse parseConfig(const char* json, size_t length) {
  ConfigParse result;
  JsonDocument doc;
  if (deserializeJson(doc, json, length) != DeserializationError::Ok || !doc.is<JsonObject>()) {
    snprintf(result.reason, sizeof(result.reason), "JSON inválido");
    return result;
  }
  if (doc["rev"].is<long>() && doc["rev"].as<long>() >= 1) {
    result.rev = static_cast<uint32_t>(doc["rev"].as<long>());
  }
  if (doc["v"].as<long>() != 1) {
    snprintf(result.reason, sizeof(result.reason), "versão do contrato não suportada");
    return result;
  }
  if (result.rev == 0) {
    snprintf(result.reason, sizeof(result.reason), "rev ausente ou inválida");
    return result;
  }

  DeviceConfig& c = result.config;
  long value = 0;
  if (!readInt(doc["interval_s"], "interval_s", 10, 3600, value, result)) return result;
  c.intervalS = static_cast<uint16_t>(value);
  if (!readInt(doc["health_s"], "health_s", 60, 86400, value, result)) return result;
  c.healthS = static_cast<uint32_t>(value);
  if (!readInt(doc["economy_batch_s"], "economy_batch_s", 60, 3600, value, result)) return result;
  c.economyBatchS = static_cast<uint16_t>(value);
  if (!readInt(doc["survival_sleep_s"], "survival_sleep_s", 300, 10800, value, result)) return result;
  c.survivalSleepS = static_cast<uint16_t>(value);

  const char* edge = doc["rain_edge"] | "";
  if (strcmp(edge, "change") == 0) {
    c.rainEdge = RainEdge::Change;
  } else if (strcmp(edge, "falling") == 0) {
    c.rainEdge = RainEdge::Falling;
  } else {
    snprintf(result.reason, sizeof(result.reason), "rain_edge deve ser change ou falling");
    return result;
  }

  JsonVariantConst power = doc["power"];
  if (!power.is<JsonObjectConst>()) {
    snprintf(result.reason, sizeof(result.reason), "power ausente");
    return result;
  }
  const char* mode = power["mode"] | "";
  if (strcmp(mode, "auto") == 0) {
    c.powerMode = PowerConfigMode::Auto;
  } else if (strcmp(mode, "normal") == 0) {
    c.powerMode = PowerConfigMode::Normal;
  } else if (strcmp(mode, "economy") == 0) {
    c.powerMode = PowerConfigMode::Economy;
  } else {
    snprintf(result.reason, sizeof(result.reason), "power.mode deve ser auto, normal ou economy");
    return result;
  }
  if (!readInt(power["economy_below_mv"], "power.economy_below_mv", 3000, 4200, value, result)) return result;
  c.economyBelowMv = static_cast<uint16_t>(value);
  if (!readInt(power["survival_below_mv"], "power.survival_below_mv", 3000, 4200, value, result)) return result;
  c.survivalBelowMv = static_cast<uint16_t>(value);
  if (!readInt(power["recover_above_mv"], "power.recover_above_mv", 3000, 4300, value, result)) return result;
  c.recoverAboveMv = static_cast<uint16_t>(value);
  if (!readInt(power["bat_full_scale_mv"], "power.bat_full_scale_mv", 3000, 6000, value, result)) return result;
  c.batFullScaleMv = static_cast<uint16_t>(value);

  if (!(c.survivalBelowMv < c.economyBelowMv && c.economyBelowMv < c.recoverAboveMv)) {
    snprintf(result.reason, sizeof(result.reason),
             "limiares fora de ordem (sobrevivência < economia < recuperação)");
    return result;
  }
  if (c.economyBatchS < c.intervalS) {
    snprintf(result.reason, sizeof(result.reason), "economy_batch_s menor que interval_s");
    return result;
  }
  result.ok = true;
  return result;
}

size_t writeConfig(const DeviceConfig& config, uint32_t rev, char* out, size_t capacity) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["rev"] = rev;
  doc["interval_s"] = config.intervalS;
  doc["health_s"] = config.healthS;
  doc["economy_batch_s"] = config.economyBatchS;
  doc["survival_sleep_s"] = config.survivalSleepS;
  doc["rain_edge"] = config.rainEdge == RainEdge::Falling ? "falling" : "change";
  JsonObject power = doc["power"].to<JsonObject>();
  power["mode"] = config.powerMode == PowerConfigMode::Normal    ? "normal"
                  : config.powerMode == PowerConfigMode::Economy ? "economy"
                                                                 : "auto";
  power["economy_below_mv"] = config.economyBelowMv;
  power["survival_below_mv"] = config.survivalBelowMv;
  power["recover_above_mv"] = config.recoverAboveMv;
  power["bat_full_scale_mv"] = config.batFullScaleMv;
  return serializeJson(doc, out, capacity);
}

}  // namespace wx
