#include "rtc_state.h"

#include <climits>
#include <cmath>

#include "crc.h"

namespace wx {

namespace {

constexpr uint16_t kNone16 = 0xFFFF;

}  // namespace

PackedReading pack(const Reading& r) {
  PackedReading p{};
  p.seq = r.seq;
  p.ts = r.ts;
  p.dur = r.dur;
  p.tempCenti = hasValue(r.temp) ? static_cast<int16_t>(std::lround(r.temp * 100.0f)) : INT16_MIN;
  p.humDeci = hasValue(r.hum) ? static_cast<uint16_t>(std::lround(r.hum * 10.0f)) : kNone16;
  p.presDeci = hasValue(r.pres) ? static_cast<uint16_t>(std::lround(r.pres * 10.0f)) : kNone16;
  return p;
}

Reading unpack(const PackedReading& p) {
  Reading r;
  r.seq = p.seq;
  r.ts = p.ts;
  r.dur = p.dur;
  r.temp = p.tempCenti == INT16_MIN ? NAN : p.tempCenti / 100.0f;
  r.hum = p.humDeci == kNone16 ? NAN : p.humDeci / 10.0f;
  r.pres = p.presDeci == kNone16 ? NAN : p.presDeci / 10.0f;
  return r;
}

void seal(RtcState& state) {
  state.magic = RtcState::kMagic;
  state.crc = crc32(&state, offsetof(RtcState, crc));
}

bool isValid(const RtcState& state) {
  return state.magic == RtcState::kMagic && state.crc == crc32(&state, offsetof(RtcState, crc));
}

RtcState freshState(uint32_t randomRun) {
  RtcState state;
  // run 0 would read as "missing" on the server side; any other value is fine.
  state.run = randomRun == 0 ? 1 : randomRun;
  return state;
}

}  // namespace wx
