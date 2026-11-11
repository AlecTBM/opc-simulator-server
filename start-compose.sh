#!/usr/bin/env bash
set -euo pipefail

HOST_IP="$(hostname -I | awk '{print $1}')"

if [ -z "$HOST_IP" ]; then
  echo "Unable to determine host IPv4 address" >&2
  exit 1
fi

printf 'OPCUA_HOST_IP=%s\n' "$HOST_IP" > .env
echo "Starting stack with OPCUA_HOST_IP=$HOST_IP"

docker compose up -d