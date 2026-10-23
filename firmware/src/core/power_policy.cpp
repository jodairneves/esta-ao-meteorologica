#include "power_policy.h"

namespace wx {

PowerMode bootPowerMode(uint16_t batteryMv, PowerConfigMode config, const PowerThresholds& t) {
  if (config == PowerConfigMode::Normal) return PowerMode::Normal;
  if (config == PowerConfigMode::Economy) return PowerMode::Economy;
  if (batteryMv == kNoBattery) return PowerMode::Normal;
  if (batteryMv < t.survivalBelowMv) return PowerMode::Survival;
  if (batteryMv < t.economyBelowMv) return PowerMode::Economy;
  return PowerMode::Normal;
}

PowerMode PowerPolicy::target(uint16_t batteryMv, const PowerThresholds& t) const {
  if (batteryMv < t.survivalBelowMv) return PowerMode::Survival;
  if (mode_ == PowerMode::Normal) {
    return batteryMv < t.economyBelowMv ? PowerMode::Economy : PowerMode::Normal;
  }
  // Economy and Survival leave only from the recovery threshold, straight to Normal.
  if (batteryMv >= t.recoverAboveMv) return PowerMode::Normal;
  return mode_;
}

bool PowerPolicy::update(uint16_t batteryMv, PowerConfigMode config, const PowerThresholds& t) {
  // A fixed profile applies at once; there is nothing to smooth.
  if (config != PowerConfigMode::Auto) {
    const PowerMode fixed = config == PowerConfigMode::Economy ? PowerMode::Economy : PowerMode::Normal;
    streak_ = 0;
    candidate_ = fixed;
    if (fixed == mode_) return false;
    mode_ = fixed;
    return true;
  }
  if (batteryMv == kNoBattery) {
    // `auto` needs the divisor on A0; without a reading the profile stays as it is.
    streak_ = 0;
    candidate_ = mode_;
    return false;
  }

  const PowerMode wanted = target(batteryMv, t);
  if (wanted == mode_) {
    streak_ = 0;
    candidate_ = mode_;
    return false;
  }
  if (wanted != candidate_) {
    candidate_ = wanted;
    streak_ = 0;
  }
  if (++streak_ < kSwitchAfter) return false;
  mode_ = wanted;
  streak_ = 0;
  return true;
}

}  // namespace wx
