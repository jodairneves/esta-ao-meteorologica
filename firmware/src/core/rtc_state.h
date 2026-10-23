#pragma once

#include <cstddef>
#include <cstdint>

#include "command.h"
#include "power_policy.h"
#include "reading.h"
#include "types.h"

namespace wx {

/** A Survival reading kept across deep sleep until it is sent (compact: 16 bytes). */
struct PackedReading {
  uint32_t seq;
  uint32_t ts;
  uint16_t dur;
  int16_t tempCenti;   // °C x 100, INT16_MIN = none
  uint16_t humDeci;    // % x 10, 0xFFFF = none
  uint16_t presDeci;   // hPa x 10, 0xFFFF = none
};

PackedReading pack(const Reading& reading);
/** Wind and rain are not measured while sleeping: the unpacked reading carries them as null. */
Reading unpack(const PackedReading& packed);

/**
 * What must survive a reset or deep sleep, kept in the ESP8266 RTC memory with a CRC
 * (design §4.2). Losing it (power cut) starts a new random `run`: the server then knows the
 * rain counter restarted.
 */
struct RtcState {
  static constexpr uint32_t kMagic = 0x57584D31;  // "WXM1"
  static constexpr uint8_t kPendingCapacity = 12;

  uint32_t magic = kMagic;
  uint32_t run = 0;
  uint32_t seq = 0;
  uint32_t rainCount = 0;
  uint32_t dropped = 0;
  /** Clock when going to deep sleep and how long: dates the wake-up if NTP does not answer. */
  uint32_t sleepStartEpoch = 0;
  uint32_t sleepS = 0;
  /** Power policy (mode, candidate and streak) carried over deep sleep. */
  uint8_t mode = 0;
  uint8_t candidate = 0;
  uint8_t streak = 0;
  /** Last access point, for a fast reconnection in Economy and Survival. */
  uint8_t wifiChannel = 0;
  uint8_t bssid[6] = {0, 0, 0, 0, 0, 0};
  /** Set while the first 3 s after a reset run: a second reset meanwhile opens the portal. */
  uint8_t resetArmed = 0;
  uint8_t pendingCount = 0;
  RecentCommands commands;
  PackedReading pending[kPendingCapacity];
  uint32_t crc = 0;
};

static_assert(sizeof(RtcState) <= 512, "the ESP8266 RTC user memory holds 512 bytes");
static_assert(sizeof(RtcState) % 4 == 0, "RTC memory is accessed in 4-byte blocks");

/** Computes and stores the CRC; call right before writing the struct to RTC memory. */
void seal(RtcState& state);

/** True when the magic and the CRC match (the memory survived). */
bool isValid(const RtcState& state);

/** Fresh state for a new run (the random value comes from the hardware RNG). */
RtcState freshState(uint32_t randomRun);

}  // namespace wx
