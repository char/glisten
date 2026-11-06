#!/usr/bin/env bash
# Publish a small site; paths may contain spaces or Unicode.
set -euo pipefail

root=${1:-"$HOME/site"}
target=${2:-staging}
log="$root/deploy.log"
files=(index.html 'café.html' assets/app.css)

announce() {
  local message=$1
  printf '[%s] %s\n' "$(date +%T)" "$message" | tee -a "$log"
}

case "$target" in
  staging|preview)
    destination="/srv/preview"
    ;;
  production)
    destination="/srv/www"
    ;;
  *)
    printf 'unknown target: %s\n' "$target" >&2
    exit 2
    ;;
esac

if [[ ! -d "$root" || ${#files[@]} -eq 0 ]]; then
  echo 'nothing to deploy' >&2
  exit 1
fi

for file in "${files[@]}"; do
  if [[ -f "$root/$file" ]]; then
    install -D -- "$root/$file" "$destination/$file"
  else
    announce "missing: $file"
  fi
done

count=$(( ${#files[@]} + 1 ))
((count > 0)) && announce "checked $count entries"
while IFS= read -r line; do
  printf '  %s\n' "$line"
done < <(printf '%s\n' "${files[@]}")
