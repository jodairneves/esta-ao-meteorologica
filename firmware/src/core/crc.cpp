#include "crc.h"

namespace wx {

uint32_t crc32(const void* data, size_t length) {
  const auto* bytes = static_cast<const uint8_t*>(data);
  uint32_t crc = 0xFFFFFFFFu;
  for (size_t i = 0; i < length; i++) {
    crc ^= bytes[i];
    for (int bit = 0; bit < 8; bit++) {
      crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
    }
  }
  return ~crc;
}

uint8_t htu21dCrc(uint8_t msb, uint8_t lsb) {
  // The polynomial 0x131 shifted to line up with the 24-bit working value (datasheet §5.6).
  uint32_t remainder = (static_cast<uint32_t>(msb) << 16) | (static_cast<uint32_t>(lsb) << 8);
  uint32_t divisor = 0x988000u;
  for (int i = 0; i < 16; i++) {
    if (remainder & (1u << (23 - i))) remainder ^= divisor;
    divisor >>= 1;
  }
  return static_cast<uint8_t>(remainder);
}

}  // namespace wx
