CREATE TABLE climate_tea_data (
    id SERIAL PRIMARY KEY,
    district VARCHAR(50),
    month_year DATE,
    production_mkg FLOAT,
    productivity_kgha FLOAT,
    rainy_days FLOAT,
    dry_days FLOAT,
    rainfall_mm FLOAT,
    rh_morning FLOAT,
    rh_evening FLOAT,
    morning_temp_min FLOAT,
    morning_temp_max FLOAT,
    evening_temp_min FLOAT,
    evening_temp_max FLOAT
);
