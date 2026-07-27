#!/usr/bin/env python3
"""Rafraîchit les caches partagés du filtre catalogue "Type de fichier" (front Angular du portail).

Scanne tout le catalogue via l'API de recherche konsult (dans le réseau docker interne, via
`docker exec` sur le conteneur du portail) et écrit 2 assets statiques servis par nginx à tous les
utilisateurs :
- `assets/file-types-cache.json` : nombre de JDD par type de fichier distinct, ex.
  `[{"type": "CSV", "count": 142}, ...]` — peuple les cases à cocher du filtre.
- `assets/catalog-snapshot.json` : instantané complet du catalogue (mêmes `Metadata` que l'API de
  recherche), pour filtrer/paginer **entièrement côté client, instantanément**, quand le filtre
  "Type de fichier" est actif seul (sans autre filtre) — voir pourquoi ci-dessous.

Pourquoi 2 caches, pas juste le premier : un scan complet du catalogue prend ~0.2-0.3s par JDD sur
ce nœud (mesuré manuellement, jusqu'à ~100-130s pour ~350 JDD) — bien trop lent pour être fait à la
demande. Peupler la liste des cases à cocher ne suffisait pas : **appliquer** le filtre nécessite
aussi, par-dessus, de refaire un scan complet à chaque fois côté front pour trouver les JDD
correspondants (aucun paramètre de recherche backend pour le type de fichier, voir
`PLAN_PR_RUDI_FILTRE_TYPE_FICHIER.md` §7) — d'où le blocage observé ("mouline en boucle sans
résultat"). L'instantané complet élimine ce second scan : une fois téléchargé (une fois, mis en
cache), tout filtrage/toute pagination se fait en mémoire dans le navigateur.

Voir `KonsultMetierService.getAvailableFileTypes()` / `.getCatalogSnapshot()` (front) pour la
lecture de ces caches et leur repli sur un scan live si l'asset est absent.

À garder synchronisé avec la logique de dérivation de type du front
(`KonsultMetierService.getMediaTypeLabel()`) : FILE -> extension déduite du type MIME (mapping
standard + table `custom-mime-db.ts`) ; SERVICE -> `connector.interface_contract` en majuscules,
**seulement** pour les protocoles cartographiques (wms/wmts/wfs) — les autres contrats (ex. 'dwnl',
un simple lien de téléchargement/pointeur, pas un format de fichier) sont ignorés.

Usage : python3 refresh_file_types_cache.py [--container NOM] [--dest CHEMIN_DANS_LE_CONTENEUR]
                                             [--snapshot-dest CHEMIN_DANS_LE_CONTENEUR]
Conçu pour tourner via cron (voir le crontab de l'utilisateur), aucune dépendance hors stdlib.
"""
import argparse
import json
import mimetypes
import os
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

DEFAULT_CONTAINER = "rudiplatform-portail-1"
KONSULT_BASE_URL = "https://konsult:8443/konsult/v1/datasets/metadatas"
KONSULT_HOST_HEADER = "rudi.localhost"
PAGE_SIZE = 100
DEFAULT_DEST_PATH = "/usr/share/nginx/html/assets/file-types-cache.json"
DEFAULT_SNAPSHOT_DEST_PATH = "/usr/share/nginx/html/assets/catalog-snapshot.json"
REQUEST_TIMEOUT_SECONDS = 120

# Doit rester synchronisé avec src/app/core/services/map/map-protocols.ts (front Angular) : seuls
# ces contrats de connecteur SERVICE représentent un vrai "type de fichier" cartographique.
MAP_PROTOCOLS_SUPPORTED = {"wms", "wmts", "wfs"}

# Doit rester synchronisé avec src/assets/mime-db/custom-mime-db.ts (front Angular) : types MIME non
# reconnus par la base mime standard.
CUSTOM_MIME_EXTENSIONS = {
    "application/x-executable": "executable",
    "application/x-www-form-urlencoded": "urlencoded",
    "image/x-mng": "mng",
    "text/x-yaml": "yaml",
    "application/graphql": "graphql",
    "application/sql": "sql",
    "application/vnd.api+json": "api",
    "application/zstd": "zst",
    "image/flif": "flif",
    "multipart/form-data": "data",
    "text/php": "php",
    "application/geopackage+sqlite3": "gpkg",
}

CRYPT_SUFFIX = "+crypt"


def file_extension(mime_type: str) -> str | None:
    mime_type = (mime_type or "").removesuffix(CRYPT_SUFFIX)
    if not mime_type:
        return None
    guessed = mimetypes.guess_extension(mime_type, strict=False)
    if guessed:
        return guessed.lstrip(".").upper()
    custom = CUSTOM_MIME_EXTENSIONS.get(mime_type)
    return custom.upper() if custom else None


def media_type_label(media: dict) -> str | None:
    media_type = media.get("media_type")
    if media_type == "FILE":
        return file_extension(media.get("file_type", ""))
    if media_type == "SERVICE":
        contract = (media.get("connector") or {}).get("interface_contract")
        if contract and contract in MAP_PROTOCOLS_SUPPORTED:
            return contract.upper()
        return None
    return None


def fetch_page(container: str, offset: int) -> dict:
    url = f"{KONSULT_BASE_URL}?offset={offset}&limit={PAGE_SIZE}"
    result = subprocess.run(
        [
            "docker", "exec", container, "curl", "-sk", url,
            "-H", f"Host: {KONSULT_HOST_HEADER}",
            "-H", "Accept: application/json",
        ],
        capture_output=True, text=True, timeout=REQUEST_TIMEOUT_SECONDS, check=True,
    )
    return json.loads(result.stdout)


def dataset_file_types(metadata: dict) -> set[str]:
    """Types distincts d'un JDD (dédupliqués : 2 CSV du même JDD ne comptent qu'une fois)."""
    types = set()
    for media in metadata.get("available_formats", []):
        label = media_type_label(media)
        if label:
            types.add(label)
    return types


def scan_catalog(container: str) -> tuple[Counter, list[dict]]:
    """Nombre de JDD par type de fichier (pas nombre de médias : un JDD avec 2 CSV compte pour 1),
    et l'instantané complet du catalogue (mêmes JDD, pour filtrage/pagination client instantanés)."""
    offset = 0
    total = None
    counts: Counter = Counter()
    all_metadatas: list[dict] = []
    while total is None or offset < total:
        page = fetch_page(container, offset)
        total = page["total"]
        items = page.get("items", [])
        if not items:
            break
        for metadata in items:
            counts.update(dataset_file_types(metadata))
        all_metadatas.extend(items)
        offset += len(items)
    return counts, all_metadatas


def publish(container: str, dest_path: str, payload) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tmp:
        json.dump(payload, tmp, ensure_ascii=False)
        tmp_path = Path(tmp.name)
    try:
        # NamedTemporaryFile crée le fichier en 0600 : docker cp préserve ce mode, et nginx
        # (autre utilisateur dans le conteneur) ne peut alors plus le lire (403 constaté en test).
        os.chmod(tmp_path, 0o644)
        subprocess.run(
            ["docker", "cp", str(tmp_path), f"{container}:{dest_path}"],
            check=True,
        )
        subprocess.run(
            ["docker", "exec", container, "chmod", "644", dest_path],
            check=True,
        )
    finally:
        tmp_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", default=DEFAULT_CONTAINER)
    parser.add_argument("--dest", default=DEFAULT_DEST_PATH)
    parser.add_argument("--snapshot-dest", default=DEFAULT_SNAPSHOT_DEST_PATH)
    args = parser.parse_args()

    try:
        counts, all_metadatas = scan_catalog(args.container)
    except subprocess.CalledProcessError as error:
        print(f"ECHEC scan catalogue : {error}", file=sys.stderr)
        return 1
    except (json.JSONDecodeError, KeyError) as error:
        print(f"ECHEC lecture réponse konsult : {error}", file=sys.stderr)
        return 1

    if not counts or not all_metadatas:
        print("ECHEC : 0 type de fichier/JDD trouvé, on n'écrase pas les caches existants", file=sys.stderr)
        return 1

    types_payload = [
        {"type": file_type, "count": count}
        for file_type, count in sorted(counts.items())
    ]
    publish(args.container, args.dest, types_payload)
    publish(args.container, args.snapshot_dest, all_metadatas)

    summary = ', '.join(f"{file_type}={count}" for file_type, count in sorted(counts.items()))
    print(f"OK : {len(counts)} types publiés ({summary}) ; instantané de {len(all_metadatas)} JDD publié")
    return 0


if __name__ == "__main__":
    sys.exit(main())
