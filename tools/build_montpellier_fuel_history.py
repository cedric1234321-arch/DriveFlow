#!/usr/bin/env python3
"""Build a compact Montpellier Gazole history from official French annual ZIPs.

Input files are the XML ZIP archives published by:
https://www.prix-carburants.gouv.fr/rubrique/opendata/

The script intentionally does not download anything. Give it the official ZIPs
for the required years; it filters road stations around Montpellier, excludes
motorway stations, forward-fills each station's last declared Gazole price,
and writes a daily median series small enough to ship with DriveFlow.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import zipfile
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from pathlib import Path
import xml.etree.ElementTree as ET

MONTPELLIER_LAT = 43.6109
MONTPELLIER_LON = 3.8763


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("archives", nargs="+", type=Path, help="Official annual ZIP archive(s), e.g. 2025 + current 2026")
    p.add_argument("--start", default="2025-01-30")
    p.add_argument("--end", default=date.today().isoformat())
    p.add_argument("--lat", type=float, default=MONTPELLIER_LAT)
    p.add_argument("--lon", type=float, default=MONTPELLIER_LON)
    p.add_argument("--radius-km", type=float, default=15.0)
    p.add_argument("--max-stale-days", type=int, default=60, help="Ignore a station price if its last declaration is older")
    p.add_argument("--min-stations", type=int, default=3)
    p.add_argument("--output", type=Path, default=Path("v6/fuel-history-montpellier.json"))
    return p.parse_args()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def coord(value: str | None) -> float | None:
    if not value:
        return None
    try:
        x = float(value)
    except ValueError:
        return None
    return x / 100000 if abs(x) > 1000 else x


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            pass
    return None


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def iter_pdv(xml_file):
    # ElementTree streaming keeps memory bounded even for the ~30 MB annual archives.
    context = ET.iterparse(xml_file, events=("end",))
    for _, elem in context:
        if local_name(elem.tag) == "pdv":
            yield elem
            elem.clear()


def extract_archive(path: Path, center_lat: float, center_lon: float, radius_km: float):
    station_updates: dict[str, list[tuple[datetime, float]]] = defaultdict(list)
    station_meta: dict[str, dict] = {}
    with zipfile.ZipFile(path) as zf:
        xml_names = [n for n in zf.namelist() if n.lower().endswith(".xml")]
        if not xml_names:
            raise RuntimeError(f"No XML file found in {path}")
        # Official annual archives normally contain a single XML stock file.
        for xml_name in xml_names:
            with zf.open(xml_name) as fh:
                for pdv in iter_pdv(fh):
                    sid = pdv.attrib.get("id") or ""
                    lat, lon = coord(pdv.attrib.get("latitude")), coord(pdv.attrib.get("longitude"))
                    if not sid or lat is None or lon is None:
                        continue
                    if str(pdv.attrib.get("pop", "")).upper() == "A":  # motorway
                        continue
                    distance = haversine_km(center_lat, center_lon, lat, lon)
                    if distance > radius_km:
                        continue
                    station_meta[sid] = {"lat": lat, "lon": lon, "distanceKm": round(distance, 2)}
                    for node in pdv.iter():
                        if local_name(node.tag) != "prix" or str(node.attrib.get("nom", "")).lower() != "gazole":
                            continue
                        when = parse_dt(node.attrib.get("maj"))
                        try:
                            value = float(str(node.attrib.get("valeur", "")).replace(",", "."))
                        except ValueError:
                            continue
                        if when and 0.5 <= value <= 4.0:
                            station_updates[sid].append((when, value))
    return station_updates, station_meta


def merge_updates(all_updates, new_updates):
    for sid, rows in new_updates.items():
        all_updates[sid].extend(rows)


def dedupe_sort(rows: list[tuple[datetime, float]]) -> list[tuple[datetime, float]]:
    by_time = {}
    for when, value in rows:
        by_time[when] = value
    return sorted(by_time.items())


def build_daily(updates, start: date, end: date, max_stale_days: int, min_stations: int):
    cursors = {sid: {"rows": dedupe_sort(rows), "i": -1} for sid, rows in updates.items() if rows}
    out = []
    d = start
    while d <= end:
        cutoff = datetime.combine(d, time.max)
        values = []
        for state in cursors.values():
            rows = state["rows"]
            i = state["i"]
            while i + 1 < len(rows) and rows[i + 1][0] <= cutoff:
                i += 1
            state["i"] = i
            if i < 0:
                continue
            when, value = rows[i]
            if (cutoff.date() - when.date()).days <= max_stale_days:
                values.append(value)
        count = len(values)
        if count >= min_stations:
            median = statistics.median(values)
            q1 = statistics.quantiles(values, n=4, method="inclusive")[0] if count >= 2 else median
            q3 = statistics.quantiles(values, n=4, method="inclusive")[2] if count >= 2 else median
            confidence = "high" if count >= 8 else "medium" if count >= 4 else "low"
            out.append({
                "date": d.isoformat(),
                "pricePerL": round(median, 3),
                "stations": count,
                "q1": round(q1, 3),
                "q3": round(q3, 3),
                "confidence": confidence,
            })
        else:
            out.append({"date": d.isoformat(), "pricePerL": None, "stations": count, "confidence": "insufficient"})
        d += timedelta(days=1)
    return out


def main() -> int:
    args = parse_args()
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    if end < start:
        raise SystemExit("--end must be >= --start")
    all_updates = defaultdict(list)
    meta = {}
    for archive in args.archives:
        if not archive.exists():
            raise SystemExit(f"Archive not found: {archive}")
        updates, station_meta = extract_archive(archive, args.lat, args.lon, args.radius_km)
        merge_updates(all_updates, updates)
        meta.update(station_meta)
        print(f"{archive}: {len(station_meta)} local non-motorway stations, {sum(map(len, updates.values()))} Gazole declarations", file=sys.stderr)
    daily = build_daily(all_updates, start, end, args.max_stale_days, args.min_stations)
    payload = {
        "schemaVersion": 1,
        "source": "prix-carburants.gouv.fr / donnees.roulez-eco.fr official annual archives",
        "method": "daily median of Gazole prices, road stations within radius, motorway excluded, station prices forward-filled with stale limit",
        "location": {"name": "Montpellier", "lat": args.lat, "lon": args.lon, "radiusKm": args.radius_km},
        "period": {"start": args.start, "end": args.end},
        "maxStaleDays": args.max_stale_days,
        "minStations": args.min_stations,
        "stationsInRadius": len(meta),
        "days": daily,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    available = [x for x in daily if x["pricePerL"] is not None]
    print(f"Wrote {args.output}: {len(available)}/{len(daily)} priced days", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
