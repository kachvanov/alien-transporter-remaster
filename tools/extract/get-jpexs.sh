#!/usr/bin/env bash
# Downloads JPEXS Free Flash Decompiler into vendor/jpexs/ (idempotent).
# See docs/02-extraction-pipeline.md, step 1.
set -euo pipefail

VERSION=26.3.0
URL="https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version${VERSION}/ffdec_${VERSION}.zip"
SHA256=35f4930eb7c380afe66f2117f90b006deac0631473ad7500bb39c78f68645ecd

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${ROOT}/vendor/jpexs"
ZIP="${DEST}/ffdec.zip"

if [ -f "${DEST}/ffdec-cli.jar" ] && [ -f "${DEST}/lib/ffdec_lib.jar" ]; then
  echo "jpexs: already installed in ${DEST}"
  exit 0
fi

mkdir -p "${DEST}"

if [ -f "${ZIP}" ] && [ "$(shasum -a 256 "${ZIP}" | cut -d' ' -f1)" != "${SHA256}" ]; then
  echo "jpexs: cached zip has wrong hash, re-downloading"
  rm -f "${ZIP}"
fi

if [ ! -f "${ZIP}" ]; then
  echo "jpexs: downloading ${URL}"
  curl -fL --retry 3 -o "${ZIP}.part" "${URL}"
  mv "${ZIP}.part" "${ZIP}"
fi

ACTUAL="$(shasum -a 256 "${ZIP}" | cut -d' ' -f1)"
if [ "${ACTUAL}" != "${SHA256}" ]; then
  echo "jpexs: SHA-256 mismatch: expected ${SHA256}, got ${ACTUAL}" >&2
  rm -f "${ZIP}"
  exit 1
fi

unzip -q -o "${ZIP}" -d "${DEST}"
if [ ! -f "${DEST}/ffdec-cli.jar" ]; then
  echo "jpexs: ffdec-cli.jar not found after unzip" >&2
  exit 1
fi
echo "jpexs: installed ${VERSION} into ${DEST}"
