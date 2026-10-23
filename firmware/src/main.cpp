// Weather station firmware for the Wemos D1 mini (ESP8266). See docs/superpowers/specs, §4.
#include <Arduino.h>

#include "app/station.h"

void setup() { wx::stationSetup(); }

void loop() { wx::stationLoop(); }
