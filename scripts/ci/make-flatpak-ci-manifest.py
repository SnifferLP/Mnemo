#!/usr/bin/env python3
"""Writes the Flatpak manifest CI and the release build use.

The committed manifest (packaging/flatpak/com.mnemo.study.yml) pins the
release tag, because that is what Flathub builds: a reviewable recipe that
compiles exactly the released sources.

That tag cannot exist before the release it describes, so a checkout-based
build would always fail on it. This script copies the manifest and replaces
only the repository source with the checked-out tree, which is the same code
at the same commit. Everything else — runtime, SDK extensions, permissions,
finish args, build commands and the pinned cargo/node source lists — is
untouched, so CI validates the recipe that ships.

It also refuses to run when the manifest's tag and package.json disagree, so a
release cannot publish a bundle built from a manifest that would later point
Flathub at the wrong tag.
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "packaging/flatpak/com.mnemo.study.yml"
OUTPUT = ROOT / "packaging/flatpak/com.mnemo.study.ci.yml"

SOURCE_TYPES = ("url:", "tag:", "branch:", "commit:")
# The first four are build output that is never part of a source tree. The
# packaging paths are excluded so a local build can run this script while its
# own state directory lives inside the checkout.
SKIP_ENTRIES = (
    ".git",
    "node_modules",
    "dist",
    "src-tauri/target",
    "flatpak-build",
    "flatpak-repo",
    "flatpak-state",
    '"*.flatpak"',
)


def version() -> str:
    with (ROOT / "package.json").open(encoding="utf-8") as handle:
        return json.load(handle)["version"]


def main() -> int:
    expected = version()
    lines = MANIFEST.read_text(encoding="utf-8").splitlines()
    output: list[str] = []
    replaced = False
    index = 0

    while index < len(lines):
        line = lines[index]
        if line.strip() == "- type: git" and not replaced:
            indent = line[: len(line) - len(line.lstrip())]
            body_indent = indent + "  "
            entry = [
                f"{indent}- type: dir",
                f"{body_indent}path: ../..",
                f"{body_indent}skip:",
            ]
            entry.extend(f"{body_indent}  - {item}" for item in SKIP_ENTRIES)
            output.extend(entry)
            replaced = True
            index += 1
            # Drop the url/tag/branch lines that belong to the git source.
            while index < len(lines) and lines[index].strip().startswith(SOURCE_TYPES):
                if lines[index].strip().startswith("tag:"):
                    tag = lines[index].split(":", 1)[1].strip()
                    if tag != f"v{expected}":
                        print(
                            f"error: {MANIFEST.relative_to(ROOT)} pins {tag}, "
                            f"but package.json declares {expected}.",
                            file=sys.stderr,
                        )
                        return 1
                index += 1
            continue
        output.append(line)
        index += 1

    if not replaced:
        print(
            f"error: no git source found in {MANIFEST.relative_to(ROOT)}.",
            file=sys.stderr,
        )
        return 1

    OUTPUT.write_text("\n".join(output) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} for version {expected}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
