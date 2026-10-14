# MPM bridge

The bridge subscribes to the gateway MQTT contract and forwards low-frequency battery health to MPM.

It subscribes to:

- `libre-solar/+/+/telemetry`
- `libre-solar/+/+/event`
- `libre-solar/+/+/status`
- `libre-solar/+/+/alert`

Telemetry is retained in memory per battery and sent to MPM once per `MPM_INTERVAL_SECONDS` (default 60).
The maximum temperature observed during each interval is forwarded.
Events, alerts, and offline status are forwarded immediately.
The full telemetry stream is never sent to MPM.

## Configuration

Copy `.env.example` to the gateway `.env` and set `MPM_API_KEY` to a company-scoped MPM API key.
The local demo key is `demo-api-key-1234567890`; generate a new key in MPM for any real deployment.

The bridge uses `host.docker.internal:8000` to reach MPM because the gateway and MPM are separate Compose projects.
The Compose service adds `host-gateway` so this works on Linux.

Run the gateway stack with:

```bash
docker compose up -d --build
```

Check bridge logs with:

```bash
docker compose logs -f mpm-bridge
```

For container/source inspection and a side-by-side MQTT/API watcher, see
[MPM troubleshooting](../mpm/TROUBLESHOOTING.md).
