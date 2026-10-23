#include "config_trial.h"

namespace wx {

void ConfigTrial::start(uint32_t nowMs, bool wifiChanged, bool serverChanged) {
  active_ = true;
  wifiChanged_ = wifiChanged;
  serverChanged_ = serverChanged;
  deadlineMs_ = nowMs + kTimeoutMs;
}

ConfigTrial::Outcome ConfigTrial::update(uint32_t nowMs, bool wifiUp, bool serverUp) {
  if (!active_) return Outcome::Idle;
  if ((!wifiChanged_ || wifiUp) && (!serverChanged_ || serverUp)) {
    active_ = false;
    return Outcome::Kept;
  }
  // Signed difference: still right when millis() wraps around.
  if (static_cast<int32_t>(nowMs - deadlineMs_) >= 0) {
    active_ = false;
    return Outcome::Reverted;
  }
  return Outcome::Pending;
}

uint32_t ConfigTrial::secondsLeft(uint32_t nowMs) const {
  if (!active_) return 0;
  const int32_t left = static_cast<int32_t>(deadlineMs_ - nowMs);
  return left > 0 ? static_cast<uint32_t>(left + 999) / 1000 : 0;
}

}  // namespace wx
