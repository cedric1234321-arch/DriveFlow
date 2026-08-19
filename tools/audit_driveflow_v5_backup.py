#!/usr/bin/env python3
"""Audit a local DriveFlow V5 backup before V6 migration.

The script prints counts/invariants only. It never uploads the backup and does
not write user records into the repository.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path


def args():
    p=argparse.ArgumentParser()
    p.add_argument("backup",type=Path)
    p.add_argument("--json",action="store_true",dest="as_json")
    return p.parse_args()


def duplicates(rows):
    c=Counter(x.get("id") for x in rows if x.get("id"))
    return [k for k,v in c.items() if v>1]


def valid_date(value):
    try:
        datetime.strptime(str(value),"%Y-%m-%d")
        return True
    except Exception:
        return False


def main():
    a=args()
    data=json.loads(a.backup.read_text(encoding="utf-8"))
    sessions=data.get("sessions") or []
    uber=data.get("uberBatches") or []
    deliveroo=data.get("deliverooOrders") or []
    settings=data.get("settings") or {}
    dates=[s.get("date") for s in sessions if valid_date(s.get("date"))]
    cash_tip_notes=[]
    for s in sessions:
        note=str(s.get("note") or "")
        if re.search(r"pourboir",note,re.I) and re.search(r"esp[eè]ces",note,re.I):
            m=re.search(r"(\d+(?:[.,]\d{1,2})?)\s*€",note)
            cash_tip_notes.append({"date":s.get("date"),"amount":float(m.group(1).replace(",",".")) if m else None,"platform":"uber" if re.search(r"uber",note,re.I) else "deliveroo" if re.search(r"deliveroo",note,re.I) else None})
    report={
        "version":data.get("version"),
        "counts":{"sessions":len(sessions),"uber":len(uber),"deliveroo":len(deliveroo)},
        "period":{"firstSession":min(dates) if dates else None,"lastSession":max(dates) if dates else None},
        "sessionKinds":{
            "historyImported":sum(bool(s.get("historyImported")) for s in sessions),
            "autoHistorical":sum(bool(s.get("autoHistorical")) for s in sessions),
            "currentManual":sum(not s.get("historyImported") and not s.get("autoHistorical") for s in sessions),
        },
        "duplicateIds":{"sessions":len(duplicates(sessions)),"uber":len(duplicates(uber)),"deliveroo":len(duplicates(deliveroo))},
        "cashTipNotesDetected":cash_tip_notes,
        "settings":{
            "fuelConsumption":settings.get("fuelConsumption"),
            "fuelPrice":settings.get("fuelPrice"),
            "dailyGoal":settings.get("defaultGoal"),
            "goalOverrideCount":len(settings.get("goalOverrides") or {}),
            "uberImport":settings.get("uberImport") or {},
            "historyImport":settings.get("historyImport") or {},
        },
        "releaseGate":{
            "noDuplicateIds":not duplicates(sessions) and not duplicates(uber) and not duplicates(deliveroo),
            "allSessionsDated":len(dates)==len(sessions),
            "migrationCanProceed":bool(sessions) and not duplicates(sessions),
        }
    }
    print(json.dumps(report,ensure_ascii=False,indent=2) if a.as_json else "\n".join([
        f"DriveFlow backup v{report['version']}",
        f"Sessions: {len(sessions)} | Uber: {len(uber)} | Deliveroo: {len(deliveroo)}",
        f"Period: {report['period']['firstSession']} -> {report['period']['lastSession']}",
        f"History/manual: {report['sessionKinds']}",
        f"Duplicate IDs: {report['duplicateIds']}",
        f"Cash-tip notes detected: {len(cash_tip_notes)}",
        f"Migration gate: {'PASS' if report['releaseGate']['migrationCanProceed'] else 'FAIL'}",
    ]))


if __name__=="__main__":
    main()
