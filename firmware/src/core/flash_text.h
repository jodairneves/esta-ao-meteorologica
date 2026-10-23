#pragma once

// Constant texts kept in flash on the ESP8266 (plain strings live in RAM there) and read with the
// *_P functions; on the host the macro is a no-op, so the hardware-free code builds for tests.
#ifdef ARDUINO
#include <pgmspace.h>
#define WX_TEXT(text) PSTR(text)
#else
#define WX_TEXT(text) (text)
#endif
