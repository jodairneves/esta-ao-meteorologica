#include "command.h"

#include <ArduinoJson.h>

#include <cctype>
#include <cstring>

#include "crc.h"

namespace wx {

namespace {

// Ids are UUIDs: anything else could not be echoed back safely in the acknowledgement.
bool isPlainId(const char* id) {
  for (const char* c = id; *c != '\0'; c++) {
    if (isalnum(static_cast<unsigned char>(*c)) == 0 && *c != '-') return false;
  }
  return true;
}

}  // namespace

CommandParse parseCommand(const char* json, size_t length) {
  CommandParse result;
  JsonDocument doc;
  if (deserializeJson(doc, json, length) != DeserializationError::Ok || !doc.is<JsonObject>()) {
    result.reason = "JSON inválido";
    return result;
  }
  const char* id = doc["id"] | "";
  if (strlen(id) > 0 && strlen(id) < sizeof(result.command.id) && isPlainId(id)) {
    strncpy(result.command.id, id, sizeof(result.command.id) - 1);
    result.hasId = true;
  }
  if (doc["v"].as<long>() != 1 || !result.hasId) {
    result.reason = "comando sem versão ou sem id";
    return result;
  }
  if (!doc["exp"].is<long>() || doc["exp"].as<long>() <= 0) {
    result.reason = "comando sem validade";
    return result;
  }
  result.command.exp = static_cast<uint32_t>(doc["exp"].as<long>());

  const char* cmd = doc["cmd"] | "";
  if (strcmp(cmd, "reboot") == 0) {
    result.command.kind = CommandKind::Reboot;
  } else if (strcmp(cmd, "identify") == 0) {
    result.command.kind = CommandKind::Identify;
  } else if (strcmp(cmd, "flush") == 0) {
    result.command.kind = CommandKind::Flush;
  } else if (strcmp(cmd, "health") == 0) {
    result.command.kind = CommandKind::Health;
  } else {
    result.reason = "comando desconhecido";
    return result;
  }
  result.ok = true;
  return result;
}

bool RecentCommands::seen(const char* id) const {
  const uint32_t hash = crc32(id, strlen(id));
  for (uint32_t known : hashes) {
    if (known == hash && hash != 0) return true;
  }
  return false;
}

void RecentCommands::remember(const char* id) {
  hashes[next] = crc32(id, strlen(id));
  next = static_cast<uint8_t>((next + 1) % kSize);
}

}  // namespace wx
