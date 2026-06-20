import pandas as pd
from database import engine
from config import EXCEL_FILE

xls = pd.ExcelFile(EXCEL_FILE)

for district in xls.sheet_names:
    df = pd.read_excel(EXCEL_FILE, sheet_name=district)
    df["district"] = district

    df.columns = [
        "month_year",
        "production_mkg",
        "productivity_kgha",
        "rainy_days",
        "dry_days",
        "rainfall_mm",
        "rh_morning",
        "rh_evening",
        "morning_temp_min",
        "morning_temp_max",
        "evening_temp_min",
        "evening_temp_max",
        "district"
    ]

    df.to_sql("climate_tea_data", engine, if_exists="append", index=False)

print("Import complete")
