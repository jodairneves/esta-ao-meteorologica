#!/usr/bin/env python3
"""Shows the D1 mini serial log (115200 baud) without an interactive terminal.

Opening the port resets the board (auto-reset circuit of the D1 mini). With --portal, a second
reset one second later opens the configuration portal (the firmware's double reset). Right after
`pio run -t upload`, wait 3 s before running it: the upload's own reset and this one would also
count as a double reset.
"""

import argparse
import sys
import time

import serial  # pyserial, installed with PlatformIO


def main() -> int:
    parser = argparse.ArgumentParser(description="Log serial do D1 mini (115200), sem terminal interativo.")
    parser.add_argument("--port", default="/dev/ttyUSB0", help="porta serial (padrão /dev/ttyUSB0)")
    parser.add_argument("--seconds", type=float, default=60, help="tempo de leitura (padrão 60 s)")
    parser.add_argument("--portal", action="store_true", help="abre o portal de configuração (reset duplo)")
    args = parser.parse_args()

    link = serial.Serial()
    link.port = args.port
    link.baudrate = 115200
    link.timeout = 0.5
    link.dtr = False
    link.rts = False
    link.open()  # resets the board
    if args.portal:
        time.sleep(1.0)
        link.rts = True  # EN low: the same reset esptool does
        time.sleep(0.1)
        link.rts = False

    end = time.time() + args.seconds
    pending = b""
    try:
        while time.time() < end:
            pending += link.read(4096)
            *lines, pending = pending.split(b"\n")
            for raw in lines:
                line = raw.decode("utf-8", errors="replace").rstrip("\r")
                # The boot ROM prints at 74880 baud: its lines come out garbled at 115200.
                if line and sum(ch.isprintable() for ch in line) / len(line) > 0.9:
                    print(time.strftime("%H:%M:%S"), line, flush=True)
    except KeyboardInterrupt:
        pass
    finally:
        link.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
