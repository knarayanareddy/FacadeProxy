#!/usr/bin/env python3
"""Create deterministic zip archives with sorted entries and fixed mtimes."""
from __future__ import annotations

import os
import stat
import sys
import time
import zipfile
from pathlib import Path


def usage() -> None:
    print("usage: make-deterministic-zip.py <input-dir> <output.zip>", file=sys.stderr)
    raise SystemExit(2)


def main() -> None:
    if len(sys.argv) != 3:
        usage()
    root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    if not root.is_dir():
        raise SystemExit(f"input is not a directory: {root}")

    epoch = int(os.environ.get("SOURCE_DATE_EPOCH", "1735689600"))
    # ZIP timestamps cannot represent dates before 1980.
    date_time = time.gmtime(max(epoch, 315532800))[:6]
    output.parent.mkdir(parents=True, exist_ok=True)

    files = sorted(path for path in root.rglob("*") if path.is_file())
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in files:
            rel = path.relative_to(root).as_posix()
            info = zipfile.ZipInfo(rel, date_time=date_time)
            mode = path.stat().st_mode
            perms = 0o755 if mode & stat.S_IXUSR else 0o644
            info.external_attr = (perms & 0xFFFF) << 16
            with path.open("rb") as fh:
                zf.writestr(info, fh.read())


if __name__ == "__main__":
    main()
