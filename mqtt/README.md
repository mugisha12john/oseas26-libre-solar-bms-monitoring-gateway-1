# MQTT broker

The shared topic and payload contract, including Home Assistant discovery, is
documented in [the MQTT specification](../docs/MQTT_SPECIFICATION.md).

Mosquitto runs as the `mosquitto` Compose service and is exposed on host port
`1883`. Containers connect to `mosquitto:1883`; host tools connect to
`localhost:1883`.

For development, anonymous access is enabled. For deployment, replace it with
an `allow_anonymous false` configuration, a password file, and TLS certificates.

Subscribe on the host:

```bash
mosquitto_sub -h localhost -p 1883 -t 'libre-solar/#' -v
```

If the CLI is not installed:

```bash
docker run --rm --network host eclipse-mosquitto:2.0 \
  mosquitto_sub -h localhost -p 1883 -t 'libre-solar/#' -v
```

