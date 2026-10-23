#pragma once

namespace wx {

/** Station code rule of the contract: 3 to 32 of a-z, 0-9 and '-', not starting or ending in '-'. */
bool isValidStationCode(const char* code);

}  // namespace wx
