"""Upload test files through the same Appwrite SDK path as production.

Run from the repository root:

    .venv/bin/python appwrite_test.py

The script reads credentials from ``backend/.env`` and never prints the API
key. Uploaded files are kept in the bucket under ``masters/appwrite-test-*``.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from appwrite.client import Client
from appwrite.exception import AppwriteException
from appwrite.id import ID
from appwrite.input_file import InputFile
from appwrite.services.storage import Storage


ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / "backend" / ".env"
IMAGE_PATH = ROOT / "backend" / "image.png"
WAV_PATH = Path("/Users/soujashbanerjee/Downloads/master (1).wav")


def load_env(path: Path) -> None:
    if not path.is_file():
        raise RuntimeError(f"Environment file not found: {path}")
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is missing from {ENV_PATH}")
    return value


def upload(storage: Storage, path: Path, folder: str) -> None:
    if not path.is_file():
        raise RuntimeError(f"Input file not found: {path}")

    file_id = ID.unique()
    print(f"Uploading {path} ({path.stat().st_size:,} bytes)")
    print(f"  file_id={file_id}")
    print(f"  folder={folder}")

    uploaded = storage.create_file(
        bucket_id=required_env("APPWRITE_BUCKET_ID"),
        file_id=file_id,
        file=InputFile.from_path(str(path)),
        permissions=None,
        folder=folder,
    )
    print(f"  SUCCESS: id={uploaded.id}, name={uploaded.name}, size={uploaded.sizeactual:,} bytes")
    print()


def main() -> int:
    try:
        load_env(ENV_PATH)
        endpoint = required_env("APPWRITE_ENDPOINT")
        project_id = required_env("APPWRITE_PROJECT_ID")
        api_key = required_env("APPWRITE_API_KEY")
        bucket_id = required_env("APPWRITE_BUCKET_ID")

        client = Client()
        client.set_endpoint(endpoint)
        client.set_project(project_id)
        client.set_key(api_key)
        storage = Storage(client)

        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        folder = f"masters/appwrite-test-{stamp}"
        print(f"Project: {project_id}")
        print(f"Bucket: {bucket_id}")
        print(f"Folder: {folder}")
        print()

        for path in (IMAGE_PATH, WAV_PATH):
            try:
                upload(storage, path, folder)
            except AppwriteException as exc:
                print(f"  FAILED: code={exc.code} type={exc.type or 'unknown'}")
                print(f"  message={exc.message or 'No message'}")
                print()

        return 0
    except (RuntimeError, OSError, AppwriteException) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
