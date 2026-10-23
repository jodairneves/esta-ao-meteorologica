# Host toolchain for `pio test -e native` on machines without a C++ compiler.
FROM python:3.12-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir platformio==6.1.19
WORKDIR /firmware
