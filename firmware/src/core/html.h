#pragma once

#include <cstddef>

namespace wx {

/**
 * Copies `text` into `out` with & < > " ' escaped for HTML (element text and quoted attributes).
 * Stops before an escape that would not fit; returns the length written.
 */
size_t escapeHtml(const char* text, char* out, size_t capacity);

}  // namespace wx
