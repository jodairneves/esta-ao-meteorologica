#include "payload.h"

#include <ArduinoJson.h>

#include <cmath>

namespace wx {

namespace {

/** Two decimals are plenty for the sensors and keep the messages short. */
double rounded(float value, double scale) { return std::round(static_cast<double>(value) * scale) / scale; }

void setFloat(JsonObject object, const char* key, float value, double scale) {
  if (hasValue(value)) {
    object[key] = rounded(value, scale);
  } else {
    object[key] = nullptr;
  }
}

void setCount(JsonObject object, const char* key, uint32_t value) {
  if (hasValue(value)) {
    object[key] = value;
  } else {
    object[key] = nullptr;
  }
}

void addReading(JsonArray readings, const Reading& r) {
  JsonObject item = readings.add<JsonObject>();
  item["seq"] = r.seq;
  item["ts"] = r.ts;
  item["dur"] = r.dur;
  setFloat(item, "temp", r.temp, 100.0);
  setFloat(item, "hum", r.hum, 10.0);
  setFloat(item, "pres", r.pres, 100.0);
  setCount(item, "wind_p", r.windPulses);
  setCount(item, "gust_p", r.gustPulses);
  setCount(item, "rain_c", r.rainCount);
}

size_t finish(JsonDocument& doc, char* out, size_t capacity) {
  if (measureJson(doc) + 1 > capacity) return 0;
  return serializeJson(doc, out, capacity);
}

const char* levelName(EventLevel level) {
  switch (level) {
    case EventLevel::Debug:
      return "debug";
    case EventLevel::Warn:
      return "warn";
    case EventLevel::Error:
      return "error";
    default:
      return "info";
  }
}

}  // namespace

TelemetryBatch writeTelemetry(const ReadingBuffer& buffer, uint32_t run, char* out, size_t capacity) {
  TelemetryBatch batch;
  JsonDocument doc;
  doc["v"] = 1;
  doc["run"] = run;
  JsonArray readings = doc["readings"].to<JsonArray>();

  for (size_t i = 0; i < buffer.size() && batch.readings < kMaxBatch; i++) {
    const Reading& reading = buffer.at(i);
    if (reading.ts == 0) break;
    addReading(readings, reading);
    if (measureJson(doc) + 1 > capacity) {
      readings.remove(readings.size() - 1);
      break;
    }
    batch.readings++;
  }
  if (batch.readings == 0) return batch;
  batch.length = serializeJson(doc, out, capacity);
  return batch;
}

size_t writeStatus(const StatusInfo& status, char* out, size_t capacity) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["state"] = status.state == LinkState::Sleeping ? "sleeping" : "online";
  if (status.ts != 0) doc["ts"] = status.ts;
  doc["mode"] = powerModeName(status.mode);
  if (status.state == LinkState::Sleeping && status.next != 0) doc["next"] = status.next;
  doc["fw"] = status.fw;
  return finish(doc, out, capacity);
}

size_t writeHealth(const HealthInfo& h, char* out, size_t capacity) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["ts"] = h.ts;
  doc["fw"] = h.fw;
  doc["mode"] = powerModeName(h.mode);
  if (h.batteryMv != 0) {
    doc["bat_mv"] = h.batteryMv;
  } else {
    doc["bat_mv"] = nullptr;
  }
  if (h.rssi != 0) {
    doc["rssi"] = h.rssi;
  } else {
    doc["rssi"] = nullptr;
  }
  doc["heap"] = h.heap;
  doc["heap_frag"] = h.heapFrag;
  doc["uptime"] = h.uptimeS;
  if (h.reset) {
    doc["reset"] = h.reset;
  } else {
    doc["reset"] = nullptr;
  }
  doc["wifi_reconn"] = h.wifiReconnects;
  doc["mqtt_reconn"] = h.mqttReconnects;
  doc["buf"] = h.buffered;
  doc["dropped"] = h.dropped;

  // The climate sensor found is reported, the other one as absent: the server matches it
  // against the station version.
  JsonObject sensors = doc["sensors"].to<JsonObject>();
  const SensorHealth absent = SensorHealth::Absent;
  sensors["bme280"] = sensorHealthName(h.climate == ClimateSensor::Bme280 ? h.climateHealth : absent);
  sensors["htu21d"] = sensorHealthName(h.climate == ClimateSensor::Htu21d ? h.climateHealth : absent);
  sensors["wind"] = "ok";
  sensors["rain"] = "ok";
  if (h.cfgRev != 0) {
    doc["cfg_rev"] = h.cfgRev;
  } else {
    doc["cfg_rev"] = nullptr;
  }
  return finish(doc, out, capacity);
}

size_t writeEvent(EventLevel level, const char* code, const char* message, const char* dataJson,
                  uint32_t ts, char* out, size_t capacity) {
  JsonDocument doc;
  doc["v"] = 1;
  if (ts != 0) {
    doc["ts"] = ts;
  } else {
    doc["ts"] = nullptr;
  }
  doc["level"] = levelName(level);
  doc["code"] = code;
  doc["msg"] = message;
  if (dataJson != nullptr) {
    JsonDocument data;
    if (deserializeJson(data, dataJson) == DeserializationError::Ok) doc["data"] = data;
  }
  return finish(doc, out, capacity);
}

}  // namespace wx
