#include "html.h"

#include <cstring>

namespace wx {

size_t escapeHtml(const char* text, char* out, size_t capacity) {
  if (capacity == 0) return 0;
  size_t length = 0;
  for (const char* c = text != nullptr ? text : ""; *c != '\0'; c++) {
    const char* piece = nullptr;
    switch (*c) {
      case '&': piece = "&amp;"; break;
      case '<': piece = "&lt;"; break;
      case '>': piece = "&gt;"; break;
      case '"': piece = "&quot;"; break;
      case '\'': piece = "&#39;"; break;
      default: break;
    }
    const size_t size = piece != nullptr ? strlen(piece) : 1;
    if (length + size >= capacity) break;
    if (piece != nullptr) {
      memcpy(out + length, piece, size);
    } else {
      out[length] = *c;
    }
    length += size;
  }
  out[length] = '\0';
  return length;
}

}  // namespace wx
