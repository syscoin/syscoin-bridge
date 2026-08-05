#!/bin/sh
set -eu

env_file="${1:-.env}"

if [ ! -f "$env_file" ]; then
  echo "Backend environment file not found: $env_file" >&2
  exit 1
fi

require_env() {
  key="$1"
  if [ -z "$(env_value "$key")" ]; then
    echo "Missing required backend environment variable: ${key}" >&2
    exit 1
  fi
}

env_value() {
  key="$1"
  value=$(sed -n "s/^${key}=//p" "$env_file" | tail -n 1 | sed \
    -e 's/^[[:space:]]*//' \
    -e 's/[[:space:]]#.*$//' \
    -e 's/[[:space:]]*$//')
  case "$value" in
    \"*\")
      value=${value#\"}
      value=${value%\"}
      ;;
    \'*\')
      value=${value#\'}
      value=${value%\'}
      ;;
  esac
  printf '%s\n' "$value"
}

for key in \
  MONGO_ROOT_USER \
  MONGO_ROOT_PASSWORD \
  MONGO_HOST_PORT \
  MONGO_DATA_VOLUME \
  MONGO_CONFIG_VOLUME \
  MONGO_BACKUP_VOLUME \
  BRIDGE_HOST_PORT \
  CORS_ALLOWED_ORIGIN
do
  require_env "$key"
done

if [ -n "$(env_value ADMIN_API_KEY)" ]; then
  require_env SECRET_COOKIE_PASSWORD
  cookie_password=$(env_value SECRET_COOKIE_PASSWORD)
  if [ "${#cookie_password}" -lt 32 ]; then
    echo "SECRET_COOKIE_PASSWORD must contain at least 32 characters" >&2
    exit 1
  fi
fi

if [ "$(env_value FOUNDATION_FUNDED)" = "true" ]; then
  for key in \
    NEVM_V2_ACTIVATION_BLOCK \
    NEVM_SPONSOR_PRIVATE_KEY \
    UTXO_SPONSOR_ADDRESS \
    UTXO_SPONSOR_WIF
  do
    require_env "$key"
  done
fi
