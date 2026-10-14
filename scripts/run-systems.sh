#!/usr/bin/env bash
set -euo pipefail
gateway=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
mpm=${MPM_DIR:-"$(dirname -- "$gateway")/micropowermanager"}
[[ -f "$gateway/.env" ]] || { echo 'Configure the gateway .env with MPM_API_KEY first.' >&2; exit 1; }
[[ -f "$mpm/docker-compose.yml" ]] || { echo "MPM Compose file missing: $mpm" >&2; exit 1; }
export MPM_SOURCE_DIR="$mpm"
export GATEWAY_SOURCE_DIR="$gateway"
mpm_compose=(docker compose --project-directory "$mpm" -f "$mpm/docker-compose.yml" -f "$gateway/integrations/mpm/local-source.compose.yml")
gateway_compose=(docker compose --project-directory "$gateway" -f "$gateway/docker-compose.yml")
"${mpm_compose[@]}" build backend frontend scheduler worker
"${mpm_compose[@]}" up -d --wait --wait-timeout 180 mysql redis
"${mpm_compose[@]}" up -d --wait --wait-timeout 300 backend frontend scheduler worker
"${gateway_compose[@]}" up -d --build
"${mpm_compose[@]}" ps
"${gateway_compose[@]}" ps
printf '\nMPM: http://localhost:8001/#/batteries\nGateway: http://localhost:3000\n'
bash "$gateway/scripts/inspect-mpm.sh" watch
