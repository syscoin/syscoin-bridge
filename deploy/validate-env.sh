#!/bin/sh
set -eu

env_file="${1:-.env}"

if [ ! -f "$env_file" ]; then
  echo "Backend environment file not found: $env_file" >&2
  exit 1
fi

require_env() {
  key="$1"
  if ! grep -Eq "^${key}=.+" "$env_file"; then
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
  MONGO_BACKUP_VOLUME \
  BRIDGE_HOST_PORT \
  CORS_ALLOWED_ORIGIN
do
  require_env "$key"
done

if grep -Eq '^ADMIN_API_KEY=.+' "$env_file"; then
  require_env SECRET_COOKIE_PASSWORD
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
