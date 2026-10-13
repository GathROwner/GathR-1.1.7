"""Losslessly recompress the reviewed PNG assets; requires Pillow, not app dependencies.

Run from the repository root. PNGs disguised as .webp remain PNGs so existing
native decoders, asset references and dimensions remain unchanged. Only IDAT
chunks change; all original ancillary chunks (including color metadata) stay.
"""

import argparse
import hashlib
import io
import json
import struct
from pathlib import Path

from PIL import Image


def chunks(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    offset = 8
    result = []
    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        result.append((data[offset + 4:offset + 8], data[offset:offset + length + 12]))
        offset += length + 12
    assert offset == len(data)
    return result


def optimize(path, apply):
    before = path.read_bytes()
    original_chunks = chunks(before)
    with Image.open(io.BytesIO(before)) as source:
        source.load()
        candidate_stream = io.BytesIO()
        source.save(candidate_stream, format="PNG", optimize=True, compress_level=9)
        candidate_chunks = chunks(candidate_stream.getvalue())
        assert original_chunks[0] == candidate_chunks[0], f"IHDR changed: {path}"
        replacement = b"".join(raw for kind, raw in candidate_chunks if kind == b"IDAT")
        output = bytearray(before[:8])
        written = False
        for kind, raw in original_chunks:
            if kind != b"IDAT":
                output.extend(raw)
            elif not written:
                output.extend(replacement)
                written = True
        after = bytes(output) if len(output) < len(before) else before
        with Image.open(io.BytesIO(after)) as decoded:
            decoded.load()
            assert decoded.size == source.size and decoded.mode == source.mode
            assert decoded.tobytes() == source.tobytes(), f"Pixels changed: {path}"
        assert [(k, v) for k, v in chunks(after) if k != b"IDAT"] == [
            (k, v) for k, v in original_chunks if k != b"IDAT"
        ], f"Metadata changed: {path}"
        row = {
            "path": path.as_posix(), "dimensions": list(source.size), "mode": source.mode,
            "beforeBytes": len(before), "afterBytes": len(after),
            "savedBytes": len(before) - len(after), "pixelsIdentical": True,
            "metadataIdentical": True,
            "beforeSha256": hashlib.sha256(before).hexdigest(),
            "afterSha256": hashlib.sha256(after).hexdigest(),
            "decodedPixelSha256": hashlib.sha256(source.tobytes()).hexdigest(),
        }
    if apply and after != before:
        path.write_bytes(after)
    return row


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    paths = sorted(p for p in Path("assets/fallbacks/categories").glob("*.webp")
                   if p.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n")
    assert len(paths) == 12, "Reviewed fallback inventory changed; review before running."
    paths.append(Path("assets/GathR Text Logo.png"))
    rows = [optimize(p, args.apply) for p in paths]
    report = {"applied": args.apply, "assets": rows,
              "beforeBytes": sum(r["beforeBytes"] for r in rows),
              "afterBytes": sum(r["afterBytes"] for r in rows),
              "savedBytes": sum(r["savedBytes"] for r in rows)}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
