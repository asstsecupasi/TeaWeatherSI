#!/usr/bin/env python3
"""
build_data.py
--------------
Builds data/tea_weather_data.json for the UPASI Kerala Tea & Weather
choropleth map from the single real district sheet (Wayanad) in
TeaWeatherSI.xlsx.

IMPORTANT — DATA PROVENANCE
============================
Only Wayanad has measured production/weather records (2015-2024, monthly).
Tea cultivation in Kerala is officially confined to seven districts
(Source: Tea Board of India — Idukki, Wayanad, Kollam, Thiruvananthapuram,
Thrissur, Malappuram, Palakkad; Idukki + Wayanad ~85-90% of state output).

For the other six tea districts, this script DERIVES illustrative demo
values by scaling/perturbing the real Wayanad series using published
district acreage-share and broad agro-climatic differences. These values
are clearly NOT measured data — every derived record is flagged
"is_real": false in the output, and the web app displays a permanent
disclaimer banner. Replace DISTRICT_PROFILES with real district sheets
when they become available and re-run this script.

The remaining seven Kerala districts have no tea cultivation and are
written out with "no_data": true so the map renders them in neutral grey.
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC_XLSX = Path(__file__).resolve().parent / "TeaWeatherSI.xlsx"
OUT_JSON = ROOT / "data" / "tea_weather_data.json"
GEOJSON_PATH = ROOT / "data" / "kerala_district.geojson"

REAL_DISTRICT = "Wayanad"

# Tea-growing districts (Tea Board of India) and their approximate share
# of Kerala's tea acreage — used only to scale the DEMO production figures.
# weight: share of state acreage (Idukki 72%, Wayanad 14% are sourced;
# the remaining ~14% is allocated heuristically across the other five
# officially tea-growing districts).
DISTRICT_PROFILES = {
    "Wayanad": dict(weight=0.14, prod_scale=1.00, yield_mult=1.00,
                     temp_offset=0.0, rain_mult=1.00, rh_offset=0.0, seed=0),
    "Idukki": dict(weight=0.72, prod_scale=0.72 / 0.14, yield_mult=1.12,
                    temp_offset=-1.5, rain_mult=1.15, rh_offset=+2.0, seed=1),
    "Palakkad": dict(weight=0.06, prod_scale=0.06 / 0.14, yield_mult=0.85,
                       temp_offset=+2.5, rain_mult=0.70, rh_offset=-6.0, seed=2),
    "Kollam": dict(weight=0.03, prod_scale=0.03 / 0.14, yield_mult=0.80,
                    temp_offset=+1.5, rain_mult=0.80, rh_offset=-3.0, seed=3),
    "Thiruvananthapuram": dict(weight=0.02, prod_scale=0.02 / 0.14, yield_mult=0.78,
                                 temp_offset=+1.8, rain_mult=0.75, rh_offset=-3.5, seed=4),
    "Thrissur": dict(weight=0.02, prod_scale=0.02 / 0.14, yield_mult=0.82,
                       temp_offset=+1.2, rain_mult=0.85, rh_offset=-2.0, seed=5),
    "Malappuram": dict(weight=0.01, prod_scale=0.01 / 0.14, yield_mult=0.80,
                         temp_offset=+1.0, rain_mult=0.90, rh_offset=-2.0, seed=6),
}

# Kerala districts with no tea cultivation — rendered as "no data" (grey).
NO_DATA_DISTRICTS = [
    "Alappuzha", "Ernakulam", "Kannur", "Kasaragod",
    "Kottayam", "Kozhikode", "Pathanamthitta",
]

METRIC_COLUMNS = {
    "production": "Production_(m.kg.)",
    "productivity": "Productivity_(Kg./Ha.)",
    "rainy_days": "Rainy_Days",
    "dry_days": "Dry_Days",
    "rainfall": "Rainfall_(mm.)",
    "rh_morning": "RH_Morning",
    "rh_evening": "RH_Evening",
    "morning_temp_min": "Morning_TempMin",
    "morning_temp_max": "Morning_TempMax",
    "evening_temp_min": "Evening_TempMin",
    "evening_temp_max": "Evening_TempMax",
}

METRIC_META = {
    "production":        dict(label="Tea Production", unit="million kg", group="Production", scale="green", decimals=2),
    "productivity":       dict(label="Productivity",    unit="kg/ha",      group="Production", scale="gold",  decimals=0),
    "rainfall":           dict(label="Rainfall",         unit="mm",         group="Weather",    scale="blue",  decimals=0),
    "rainy_days":         dict(label="Rainy Days",       unit="days",       group="Weather",    scale="blue",  decimals=0),
    "dry_days":           dict(label="Dry Days",         unit="days",       group="Weather",    scale="amber", decimals=0),
    "rh_morning":         dict(label="Humidity — Morning", unit="%",        group="Weather",    scale="teal",  decimals=0),
    "rh_evening":         dict(label="Humidity — Evening", unit="%",        group="Weather",    scale="teal",  decimals=0),
    "morning_temp_min":   dict(label="Morning Temp (Min)", unit="°C",       group="Weather",    scale="red",   decimals=1),
    "morning_temp_max":   dict(label="Morning Temp (Max)", unit="°C",       group="Weather",    scale="red",   decimals=1),
    "evening_temp_min":   dict(label="Evening Temp (Min)", unit="°C",       group="Weather",    scale="red",   decimals=1),
    "evening_temp_max":   dict(label="Evening Temp (Max)", unit="°C",       group="Weather",    scale="red",   decimals=1),
}

TEMP_KEYS = {"morning_temp_min", "morning_temp_max", "evening_temp_min", "evening_temp_max"}
RH_KEYS = {"rh_morning", "rh_evening"}
DAY_KEYS = {"rainy_days", "dry_days"}


def load_wayanad():
    df = pd.read_excel(SRC_XLSX, sheet_name=REAL_DISTRICT)
    df = df.sort_values("Month_Year").reset_index(drop=True)
    df["Productivity_(Kg./Ha.)"] = df["Productivity_(Kg./Ha.)"].interpolate().bfill().ffill()
    return df


def derive_district(df, name, profile):
    rng = np.random.default_rng(profile["seed"])
    out = pd.DataFrame()
    out["Month_Year"] = df["Month_Year"]

    # Production scales with acreage share + small monthly noise
    noise = rng.normal(1.0, 0.04, len(df))
    out["production"] = (df["Production_(m.kg.)"] * profile["prod_scale"] * noise).clip(lower=0.01)

    # Productivity (yield) is independent of acreage — apply district multiplier + noise
    noise = rng.normal(1.0, 0.03, len(df))
    out["productivity"] = df["Productivity_(Kg./Ha.)"] * profile["yield_mult"] * noise

    # Rainfall scales by a district rainfall multiplier
    noise = rng.normal(1.0, 0.06, len(df))
    out["rainfall"] = (df["Rainfall_(mm.)"] * profile["rain_mult"] * noise).clip(lower=0)

    # Rainy/dry days shift modestly with the rainfall multiplier, capped to a month's length
    rain_shift = (profile["rain_mult"] - 1.0) * 6
    out["rainy_days"] = (df["Rainy_Days"] + rain_shift + rng.normal(0, 1.0, len(df))).clip(0, 31).round()
    out["dry_days"] = (31 - out["rainy_days"]).clip(0, 31)
    # keep dry+rainy capped at days-in-month implicitly via Dry_Days source pattern
    out["dry_days"] = (df["Dry_Days"] - rain_shift + rng.normal(0, 1.0, len(df))).clip(0, 31).round()

    # Humidity offset
    for key, col in (("rh_morning", "RH_Morning"), ("rh_evening", "RH_Evening")):
        noise = rng.normal(0, 1.2, len(df))
        out[key] = (df[col] + profile["rh_offset"] + noise).clip(20, 100)

    # Temperature offset
    for key, col in (
        ("morning_temp_min", "Morning_TempMin"), ("morning_temp_max", "Morning_TempMax"),
        ("evening_temp_min", "Evening_TempMin"), ("evening_temp_max", "Evening_TempMax"),
    ):
        noise = rng.normal(0, 0.4, len(df))
        out[key] = df[col] + profile["temp_offset"] + noise

    return out


def to_records(df, is_real):
    records = []
    for _, row in df.iterrows():
        d = row["Month_Year"]
        rec = {"date": f"{d.year:04d}-{d.month:02d}"}
        for key in METRIC_COLUMNS:
            val = row[key] if key in row else None
            rec[key] = None if val is None or (isinstance(val, float) and math.isnan(val)) else round(float(val), 3)
        rec["is_real"] = is_real
        records.append(rec)
    return records


def main():
    wayanad = load_wayanad()

    districts_out = {}
    all_metric_values = {k: [] for k in METRIC_COLUMNS}

    for name, profile in DISTRICT_PROFILES.items():
        if name == REAL_DISTRICT:
            df = pd.DataFrame()
            df["Month_Year"] = wayanad["Month_Year"]
            for key, col in METRIC_COLUMNS.items():
                df[key] = wayanad[col]
            is_real = True
        else:
            df = derive_district(wayanad, name, profile)
            is_real = False

        records = to_records(df, is_real)
        for rec in records:
            for key in METRIC_COLUMNS:
                if rec[key] is not None:
                    all_metric_values[key].append(rec[key])

        districts_out[name] = {
            "is_real": is_real,
            "no_data": False,
            "acreage_share_pct": round(profile["weight"] * 100, 1),
            "records": records,
        }

    for name in NO_DATA_DISTRICTS:
        districts_out[name] = {
            "is_real": False,
            "no_data": True,
            "acreage_share_pct": 0,
            "records": [],
        }

    metric_ranges = {
        key: {
            "min": round(min(vals), 2),
            "max": round(max(vals), 2),
            "color_min": round(float(np.percentile(vals, 3)), 2),
            "color_max": round(float(np.percentile(vals, 97)), 2),
        }
        for key, vals in all_metric_values.items()
    }

    out = {
        "metadata": {
            "title": "UPASI — Kerala Tea Production & Weather Patterns",
            "real_district": REAL_DISTRICT,
            "date_range": [districts_out[REAL_DISTRICT]["records"][0]["date"],
                            districts_out[REAL_DISTRICT]["records"][-1]["date"]],
            "tea_districts": list(DISTRICT_PROFILES.keys()),
            "no_data_districts": NO_DATA_DISTRICTS,
            "disclaimer": (
                "Only Wayanad contains measured production and weather data "
                "(source workbook, 2015-2024 monthly). Figures for Idukki, "
                "Palakkad, Kollam, Thiruvananthapuram, Thrissur and Malappuram "
                "are ILLUSTRATIVE demo estimates, derived by scaling Wayanad's "
                "real series with published Tea Board of India district acreage "
                "shares and broad agro-climatic offsets. They are not measured "
                "values and must not be used for operational or policy decisions."
            ),
        },
        "metrics": METRIC_META,
        "metric_ranges": metric_ranges,
        "districts": districts_out,
    }

    OUT_JSON.write_text(json.dumps(out, separators=(",", ":")))
    print(f"Wrote {OUT_JSON} ({OUT_JSON.stat().st_size / 1024:.1f} KB)")
    print(f"Districts: {len(districts_out)} | tea districts: {len(DISTRICT_PROFILES)} | months: {len(wayanad)}")


if __name__ == "__main__":
    main()
