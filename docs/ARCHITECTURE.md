# Architecture

```text
Simulator (today) or Libre Solar transport (future)
                    |
          canonical MQTT messages
                    |
               Mosquitto
          /         |         \
 Home Assistant  Prospect     MPM
```

There is exactly one BMS-facing data contract: the versioned JSON messages in
`schemas/`. Consumers subscribe to those messages and transform them locally;
they do not require platform-specific messages from the simulator or future
gateway.

The next hardware phase replaces the simulator producer with a transport
adapter for ThingSet over Wi-Fi or UART/Cicada. Its output must first be
validated against the same schemas, then published through the same topic
publisher.

