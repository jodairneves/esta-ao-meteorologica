#pragma once

#include <cstdint>

namespace wx {

/** Unix time considered valid: anything before 2024 means NTP has not answered yet. */
constexpr uint32_t kMinValidEpoch = 1704067200;  // 2024-01-01

inline bool clockIsSet(uint32_t epoch) { return epoch >= kMinValidEpoch; }

/**
 * End of the interval that contains `nowEpoch`: the next multiple of `intervalS` on the wall
 * clock (design §4.2: with NTP, intervals close at second 0 of each minute and so on). Never
 * returns `nowEpoch` itself.
 */
uint32_t nextBoundary(uint32_t nowEpoch, uint32_t intervalS);

/**
 * Milliseconds until `targetEpoch`, given the current epoch and the milliseconds already
 * elapsed in the current second. 0 when the target is in the past.
 */
uint32_t millisUntil(uint32_t targetEpoch, uint32_t nowEpoch, uint32_t millisIntoSecond);

}  // namespace wx
