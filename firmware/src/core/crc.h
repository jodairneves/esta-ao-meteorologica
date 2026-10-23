#pragma once

#include <cstddef>
#include <cstdint>

namespace wx {

/** CRC-32 (IEEE 802.3, reflected, as zlib). Guards the RTC memory and hashes command ids. */
uint32_t crc32(const void* data, size_t length);

/**
 * CRC-8 of the HTU21D (polynomial x^8 + x^5 + x^4 + 1, initial value 0) over the two data
 * bytes of a measurement.
 */
uint8_t htu21dCrc(uint8_t msb, uint8_t lsb);

}  // namespace wx
