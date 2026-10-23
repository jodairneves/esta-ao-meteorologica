# Production broker: the configuration goes in the image (no bind mounts to set up in Coolify).
FROM eclipse-mosquitto:2.1.2-alpine
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
# Healthy when the broker takes the admin login (the password comes from the container's env).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD mosquitto_pub -h 127.0.0.1 -p 1883 -u admin -P "$MOSQUITTO_DYNSEC_PASSWORD" -t wx/healthcheck -m ok -q 0 || exit 1
