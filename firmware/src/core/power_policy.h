#pragma once

#include <cstdint>

#include "types.h"

namespace wx {

/** Below this the station does not even turn the radio on (avoids brownouts) and sleeps. */
constexpr uint16_t kBrownoutMv = 3300;

/** Consecutive battery measurements needed to switch profiles (hysteresis). */
constexpr uint8_t kSwitchAfter = 3;

struct PowerThresholds {
  uint16_t economyBelowMv;
  uint16_t survivalBelowMv;
  uint16_t recoverAboveMv;
};

/** No battery divisor on A0 (or not measured yet). */
constexpr uint16_t kNoBattery = 0;

/**
 * Profile at power-on, straight from the thresholds (design §4.3). Fixed modes in the
 * configuration win; `auto` without a battery reading stays Normal.
 */
PowerMode bootPowerMode(uint16_t batteryMv, PowerConfigMode config, const PowerThresholds& t);

/**
 * Automatic profile switching. Fed with one battery measurement per minute (and per wake-up in
 * Survival); a change needs kSwitchAfter consecutive measurements pointing the same way.
 * Economy and Survival only go back to Normal from `recover_above_mv`. The state survives deep
 * sleep through the RTC memory (see rtc_state.h).
 */
class PowerPolicy {
 public:
  explicit PowerPolicy(PowerMode initial = PowerMode::Normal) : mode_(initial), candidate_(initial) {}

  /** Restores a policy saved in RTC memory. */
  PowerPolicy(PowerMode mode, PowerMode candidate, uint8_t streak)
      : mode_(mode), candidate_(candidate), streak_(streak) {}

  /** Returns true when the profile changed with this measurement. */
  bool update(uint16_t batteryMv, PowerConfigMode config, const PowerThresholds& t);

  PowerMode mode() const { return mode_; }
  PowerMode candidate() const { return candidate_; }
  uint8_t streak() const { return streak_; }

 private:
  PowerMode target(uint16_t batteryMv, const PowerThresholds& t) const;

  PowerMode mode_;
  PowerMode candidate_;
  uint8_t streak_ = 0;
};

}  // namespace wx
