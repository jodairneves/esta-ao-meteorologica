#pragma once

#include <cstddef>
#include <cstdint>

namespace wx {

enum class CommandKind : uint8_t { Reboot, Identify, Flush, Health };

/** A command from `weather/v1/{code}/cmd` (design §3.8). */
struct Command {
  char id[40] = {0};
  CommandKind kind = CommandKind::Health;
  /** Expiry, Unix seconds. */
  uint32_t exp = 0;
};

struct CommandParse {
  bool ok = false;
  Command command;
  /** The id is kept even when the command is invalid, so it can still be acknowledged. */
  bool hasId = false;
  const char* reason = nullptr;
};

CommandParse parseCommand(const char* json, size_t length);

/** Expired commands are refused with CMD_ACK ok=false, detail "expired". */
inline bool isExpired(const Command& command, uint32_t nowEpoch) { return command.exp < nowEpoch; }

/**
 * Ids of the last commands executed, kept as 32-bit hashes in RTC memory: a QoS 1 redelivery
 * (for example after `reboot`, whose PUBACK may never leave) must not run twice.
 */
class RecentCommands {
 public:
  static constexpr uint8_t kSize = 4;

  bool seen(const char* id) const;
  void remember(const char* id);

  uint32_t hashes[kSize] = {0, 0, 0, 0};
  uint8_t next = 0;
};

}  // namespace wx
