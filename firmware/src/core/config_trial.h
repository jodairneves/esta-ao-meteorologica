#pragma once

#include <cstdint>

namespace wx {

/**
 * A change made on the local page (design §4.5) is only kept once what changed connects: the
 * Wi-Fi network, the MQTT server or both. Otherwise, after the timeout, it is undone.
 */
class ConfigTrial {
 public:
  static constexpr uint32_t kTimeoutMs = 120'000;

  enum class Outcome : uint8_t { Idle, Pending, Kept, Reverted };

  void start(uint32_t nowMs, bool wifiChanged, bool serverChanged);
  /** Call it often with the connection state; Kept and Reverted are reported once. */
  Outcome update(uint32_t nowMs, bool wifiUp, bool serverUp);
  /** Ends the trial without an outcome (the caller undoes the change itself). */
  void cancel() { active_ = false; }

  bool active() const { return active_; }
  bool wifiChanged() const { return wifiChanged_; }
  bool serverChanged() const { return serverChanged_; }
  uint32_t secondsLeft(uint32_t nowMs) const;

 private:
  bool active_ = false;
  bool wifiChanged_ = false;
  bool serverChanged_ = false;
  uint32_t deadlineMs_ = 0;
};

}  // namespace wx
