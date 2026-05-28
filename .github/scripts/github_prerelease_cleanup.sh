#!/usr/bin/env bash


# Defaults to dry run unless --execute flag or EXECUTE=1 env var is set
EXECUTE=${EXECUTE:-0}

# Normalize EXECUTE: accept "true"/"false" as well as "1"/"0"
if [ "${EXECUTE}" = "true" ] || [ "${EXECUTE}" = "1" ]; then
  EXECUTE=1
else
  EXECUTE=0
fi

# Parse command line options
while [ $# -gt 0 ]; do
  case "$1" in
    --execute)
      EXECUTE=1
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--execute]  (or set EXECUTE=1 to enable execution)" >&2
      exit 1
      ;;
  esac
  shift
done

# Read package version from package.json
LATEST_VERSION=$(jq -r .version package.json)
if [ -z "$LATEST_VERSION" ] || [ "$LATEST_VERSION" = "null" ]; then
  echo "Error: could not extract version from package.json" >&2
  exit 1
fi
echo "Latest version found in package.json: $LATEST_VERSION"
if [ "$EXECUTE" = "0" ]; then
  echo "*** DRY RUN MODE: delete commands will be printed but not executed ***"
fi
echo ""

DELETED_RELEASES=()
DELETED_TAGS=()

# Helper to write to both stdout and, only when running in a GitHub Actions
# workflow context (GITHUB_STEP_SUMMARY is set), also append to the job summary.
summary() {
  echo "$1"
  if [ -n "$GITHUB_STEP_SUMMARY" ]; then
    echo "$1" >> "$GITHUB_STEP_SUMMARY"
  fi
}

echo ""
echo "Finding pre-release GitHub releases..."
gh release list --limit 100 --json tagName --jq '.[] | select(.tagName | test("-"; "i")) | .tagName' | while read -r TAG; do
  BASE_VERSION="${TAG%%-*}"
  BASE_VERSION_NO_V="${BASE_VERSION#v}"
  if [ "$(printf "%s\n%s" "$BASE_VERSION_NO_V" "$LATEST_VERSION" | sort -V | tail -n1)" == "$LATEST_VERSION" ]; then
    if [ "$EXECUTE" = "0" ]; then
      echo "* [DRY RUN] Would run: gh release delete \"$TAG\" --yes"
    else
      echo "* Deleting GitHub release: $TAG"
      gh release delete "$TAG" --yes
    fi
  else
    echo "* Skipping release: $TAG (base version $BASE_VERSION_NO_V is newer than $LATEST_VERSION)"
  fi
done

echo ""
echo "Finding pre-release Git tags..."
git fetch --tags
git tag -l "*-*" | while read -r TAG; do
  BASE_VERSION="${TAG%%-*}"
  BASE_VERSION_NO_V="${BASE_VERSION#v}"
  if [ "$(printf "%s\n%s" "$BASE_VERSION_NO_V" "$LATEST_VERSION" | sort -V | tail -n1)" == "$LATEST_VERSION" ]; then
    if [ "$EXECUTE" = "0" ]; then
      echo "* [DRY RUN] Would run: git push origin --delete refs/tags/$TAG"
    else
      echo "* Deleting tag: $TAG"
      git push origin --delete "refs/tags/$TAG"
    fi
  else
    echo "* Skipping tag: $TAG (base version $BASE_VERSION_NO_V is newer than $LATEST_VERSION)"
  fi
done

summary ""
summary "## GitHub Pre-release Cleanup Summary"
if [ "$EXECUTE" = "0" ]; then
  summary "> **DRY RUN MODE** - no releases or tags were actually deleted."
fi
summary "* Latest version: \`$LATEST_VERSION\`"
summary "* See step log above for full details of processed releases and tags."
