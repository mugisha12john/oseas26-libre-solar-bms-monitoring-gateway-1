# Trace MQTT into MicroPowerManager

Run these commands from the gateway repository.
Use `sudo` for Docker commands if your account cannot access the Docker socket.
The diagnostic scripts read the bridge's existing environment inside its container and do not print its API key.
They do not publish messages or change application data.

```bash
bash scripts/inspect-mpm.sh report
bash scripts/inspect-mpm.sh watch
```

Use `MPM_DIR=/absolute/path/to/micropowermanager` for a different checkout.
The watcher defaults to 150 seconds; set `WATCH_SECONDS=240` for a longer bridge interval.
It uses a separate MQTT client and polls the MPM health API every ten seconds.
Match MQTT topic battery IDs, SoC, cycle count, and timestamps to the stored MPM rows.
An existing row alone does not prove the bridge is forwarding new messages.
The report shows only recent logs; absence of a connection in that window is inconclusive.

The data path is:

```text
simulator/gateway -> Mosquitto -> mpm-bridge -> MPM HTTP API -> tenant database -> Batteries page
                            -> Home Assistant
                            -> gateway dashboard
```

The bridge subscribes to `libre-solar/+/+/+` and handles `telemetry`, `event`, `alert`, and `status`.
Telemetry normally forwards once per 60 seconds; events and alerts forward immediately and offline status updates health.
MPM itself receives HTTP requests rather than subscribing directly to MQTT.
Home Assistant being active proves neither that the bridge can reach MPM nor that the database is working.

To see raw messages and bridge forwarding in separate terminals:

```bash
docker compose exec -T mosquitto mosquitto_sub -h localhost \
  -t 'libre-solar/+/+/telemetry' -t 'libre-solar/+/+/event' \
  -t 'libre-solar/+/+/alert' -t 'libre-solar/+/+/status' -v
docker compose logs --since 5m -f mpm-bridge
```

This broker command uses the checked-in anonymous development broker configuration.
An authenticated broker needs its own client credentials.
Broker connection logs identify client IDs but do not prove which topics each client subscribed to.
For Home Assistant, open Settings → Devices & services → MQTT → Configure → Listen to a topic and listen to `libre-solar/#`.
To establish the actual subscriptions of every client, broker debug logging or a packet capture is needed; `$SYS` counts do not list client subscription filters.

## Findings from the inspected system, 2026-10-12

- Live telemetry was observed on `libre-solar/site-001/BAT-001/telemetry`.
- Broker logs showed the bridge client `libre-solar-mpm-bridge-19` connecting.
- The bridge health API read returned HTTP 500 and its forwarding logs also showed HTTP 500.
- `micropowermanager-mysql-1` was stopped, and backend logs showed `getaddrinfo for mysql failed`.
- The live backend had four battery routes; its battery route file matched the local checksum.
- MPM containers used `enaccess/...:latest` images with no source mounts, so future source edits do not automatically become live.
- The local Batteries page loads once on mount; it has no periodic refresh.
- The local frontend sends a login JWT, while all four battery routes require `auth:api-key`.

## Restore database connectivity

Start the existing MySQL container without recreating it or replacing volumes:

```bash
docker compose -f ../micropowermanager/docker-compose.yml start mysql
docker compose -f ../micropowermanager/docker-compose.yml ps -a
docker compose -f ../micropowermanager/docker-compose.yml logs --tail 60 mysql
bash scripts/inspect-mpm.sh watch
```

Allow MySQL to become healthy before interpreting API results.
If the API still fails, check backend logs and the active company's tenant migrations.
HTTP 401/403 suggests credentials or company access; HTTP 404 suggests a route/deployment mismatch; HTTP 422 suggests payload validation; HTTP 500 requires backend logs.
Do not use `down -v` or `migrate:fresh` to troubleshoot existing data.

## Build your local MPM source

The supplied overlay keeps the current service names, environment files, and volumes while building local application images.
Review it before deployment.
Builds need network access and may take several minutes.

```bash
export MPM_SOURCE_DIR="$(cd ../micropowermanager && pwd)"
export GATEWAY_SOURCE_DIR="$PWD"
export MPM_LOCAL_OVERLAY="$PWD/integrations/mpm/local-source.compose.yml"
mpm_local() {
  docker compose --project-directory "$MPM_SOURCE_DIR" \
    -f "$MPM_SOURCE_DIR/docker-compose.yml" -f "$MPM_LOCAL_OVERLAY" "$@"
}
mpm_local config --services
mpm_local build backend frontend scheduler worker
# Deploy after reviewing the build result; application entrypoints run migrations.
mpm_local up -d --no-deps backend frontend scheduler worker
mpm_local exec -T backend php artisan route:list --path=libre-solar
docker compose up -d --build --no-deps mpm-bridge
bash scripts/inspect-mpm.sh watch
```

Keep using both Compose files for subsequent deployments of these local images.
Check `docker compose logs` if a build or startup fails.
The PHP builds reuse installed runtime dependencies only if their `composer.lock` matches the checkout byte for byte.
This avoids re-downloading unchanged dependencies during local verification.
If the lockfile changes, rebuild the base PHP images using MPM's production Dockerfiles first.

## Display stored updates after login

After deployment, open `http://localhost:8001/#/batteries` and log into Demo Company.
Check browser Network requests for `/api/libre-solar/battery-health/health` and confirm that the frontend uses the intended backend URL.
The browser repository now uses JWT-protected `/api/batteries/health` read routes, which use the logged-in user's tenant context.
Bridge and diagnostic requests retain the existing company API-key routes under `/api/libre-solar/battery-health`.
Do not embed the bridge API key in frontend code or browser storage.
Both battery views now refresh ten seconds after the preceding request completes and stop polling when closed.
The bridge still forwards telemetry at its configured interval, normally 60 seconds.

## Start both projects with local changes

```bash
bash scripts/run-systems.sh
```

This builds all application images, starts MPM's database and Redis, waits for MPM, starts the gateway, and runs the MQTT/API watcher.
It preserves existing database volumes and disables startup demo seeding.
The overlay also gives MySQL an `unless-stopped` restart policy.
Use the Demo Company login to see data sent by the documented demo API key.

## Verification after starting both projects, 2026-10-12

MySQL was restored, the gateway `.env` was persisted, and local images were deployed for MPM backend, frontend, scheduler, and worker.
The demo key resolves to Demo Company (company 1); Nexora remains a separate tenant.
Existing databases were backed up privately to `/tmp/mpm-before-local-deploy.sql` before application startup.
Central and tenant migrations reported no pending migrations for companies 1 and 2.
The queue heartbeat check reported one master supervisor, twelve worker processes, and zero pending jobs.
Use `php artisan mpm-system-checks:horizon` in the backend container, or add `--local` when executing it inside the worker container.
The backend container has no local queue master of its own.

Verified API-key health reads and successful bridge health writes, demo login, JWT battery list/detail reads, fault history, rejection of anonymous reads, and rejection of JWT writes to the bridge API.
The deployed frontend bundle contains the JWT battery read path and its battery pages poll automatically.
The gateway dashboard, MPM frontend/backend, and Home Assistant returned HTTP 200.
