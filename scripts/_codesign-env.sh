#!/usr/bin/env bash
# Shared Apple codesign env loader for build scripts.
# Parses .env.codesign safely (parentheses in DEVELOPER_ID_APP are OK).

load_codesign_env() {
  local root="${1:?root directory required}"
  local env_file="$root/.env.codesign"

  if [[ ! -f "$env_file" ]]; then
    echo "❌  $env_file bulunamadı."
    echo "    cp .env.codesign.example .env.codesign  → değerleri doldur"
    return 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" != *=* ]] && continue

    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"

    if [[ "$value" == \"*\" && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$key=$value"
  done < "$env_file"

  export APPLE_ID="${APPLE_ID:-}"
  export APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"

  if [[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_APP_PASSWORD:-}" ]]; then
    export APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_PASSWORD}"
  fi

  export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-true}"

  if [[ -z "$APPLE_ID" || -z "$APPLE_TEAM_ID" ]]; then
    echo "❌  APPLE_ID ve APPLE_TEAM_ID .env.codesign içinde dolu olmalı"
    return 1
  fi

  if [[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
    echo "⚠️   APPLE_APP_SPECIFIC_PASSWORD yok — notarize çalışmaz"
  fi

  echo "👤  Apple ID: $APPLE_ID"
  echo "🆔  Team ID:  $APPLE_TEAM_ID"
  [[ -n "${DEVELOPER_ID_APP:-}" ]] && echo "✍️   Cert: $DEVELOPER_ID_APP"
  return 0
}
