#include "schedule.h"

namespace wx {

uint32_t nextBoundary(uint32_t nowEpoch, uint32_t intervalS) {
  if (intervalS == 0) return nowEpoch + 1;
  return (nowEpoch / intervalS + 1) * intervalS;
}

uint32_t millisUntil(uint32_t targetEpoch, uint32_t nowEpoch, uint32_t millisIntoSecond) {
  if (targetEpoch <= nowEpoch) return 0;
  const uint32_t whole = (targetEpoch - nowEpoch) * 1000;
  return whole > millisIntoSecond ? whole - millisIntoSecond : 0;
}

}  // namespace wx
