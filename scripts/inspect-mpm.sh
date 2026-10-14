#!/usr/bin/env bash
set -euo pipefail
gateway=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
mpm=${MPM_DIR:-"$(dirname -- "$gateway")/micropowermanager"}
mode=${1:-report}
if [[ "$mode" == --help ]]; then
  echo 'Usage: bash scripts/inspect-mpm.sh [report|watch]'
  echo 'Optional: MPM_DIR=/path/to/micropowermanager WATCH_SECONDS=150'
  exit 0
fi
[[ -f "$mpm/docker-compose.yml" ]] || { echo "MPM Compose file missing: $mpm" >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker is required.' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker unavailable. Try sudo bash scripts/inspect-mpm.sh (or check Docker permissions).' >&2; exit 1; }
gateway_compose=(docker compose --project-directory "$gateway" -f "$gateway/docker-compose.yml")
mpm_compose=(docker compose --project-directory "$mpm" -f "$mpm/docker-compose.yml")
if [[ "$mode" == watch ]]; then
  exec "${gateway_compose[@]}" exec -T -e WATCH_SECONDS="${WATCH_SECONDS:-150}" mpm-bridge node --input-type=module < "$gateway/scripts/watch-mpm.mjs"
fi
[[ "$mode" == report ]] || { echo "Unknown mode: $mode" >&2; exit 1; }
for directory in "$gateway" "$mpm"; do
  printf '\nProject: %s\n' "$directory"
  git -C "$directory" status --short
done
printf '\nGateway containers\n'
"${gateway_compose[@]}" ps -a
printf '\nMPM containers (check mysql, including exited containers)\n'
"${mpm_compose[@]}" ps -a
printf '\nContainer images, source directories, Compose files, mounts\n'
while IFS= read -r container; do
  [[ -n "$container" ]] || continue
  docker inspect "$container" --format '{{.Name}} image={{.Config.Image}} created={{.Created}} project={{index .Config.Labels "com.docker.compose.project.working_dir"}} files={{index .Config.Labels "com.docker.compose.project.config_files"}}{{range .Mounts}}{{printf "\n  %s -> %s" .Source .Destination}}{{end}}'
done < <({ "${gateway_compose[@]}" ps -aq; "${mpm_compose[@]}" ps -aq; })
printf '\nLive battery routes\n'
"${mpm_compose[@]}" exec -T backend php artisan route:list --path=libre-solar || true
printf '\nLocal / deployed battery-route checksums\n'
sha256sum "$mpm/src/backend/app/Plugins/LibreSolarBatteryHealth/routes/api.php" || true
"${mpm_compose[@]}" exec -T backend sha256sum app/Plugins/LibreSolarBatteryHealth/routes/api.php || true
printf '\nRecent broker connections (connections alone do not prove subscriptions)\n'
"${gateway_compose[@]}" logs --tail 250 mosquitto | awk '/New client|mpm-bridge/ {print}'
printf '\nRecent bridge results\n'
"${gateway_compose[@]}" logs --tail 350 mpm-bridge | awk '/connected to MQTT|Forwarded|Failed to|returned [0-9]/ {print substr($0,1,600)}'
printf '\nRecent backend errors\n'
"${mpm_compose[@]}" logs --tail 100 backend | awk '/ERROR|SQLSTATE|Connection refused|getaddrinfo/ {print substr($0,1,600)}'
printf '\nWatch MQTT and the authenticated MPM read API: bash scripts/inspect-mpm.sh watch\n'
