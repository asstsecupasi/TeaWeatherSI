import json
import pandas as pd
import geopandas as gpd
from dash import Dash, dcc, html, Input, Output
import plotly.express as px
import plotly.graph_objects as go
from database import engine
from config import GEOJSON_FILE

app = Dash(__name__)
server = app.server

df = pd.read_sql("SELECT * FROM climate_tea_data", engine)
df["month_year"] = pd.to_datetime(df["month_year"])

geo = gpd.read_file(GEOJSON_FILE)
geojson = json.loads(geo.to_json())

variables = {
    "Rainfall": "rainfall_mm",
    "Production": "production_mkg",
    "Humidity Morning": "rh_morning",
    "Humidity Evening": "rh_evening",
    "Morning Temp Max": "morning_temp_max",
    "Evening Temp Max": "evening_temp_max"
}

app.layout = html.Div([
    html.H1("Kerala Tea Climate Dashboard"),
    dcc.Dropdown(
        id="variable",
        options=[{"label": k, "value": v} for k, v in variables.items()],
        value="rainfall_mm"
    ),
    dcc.Slider(id="time_slider",
               min=0,
               max=len(df["month_year"].unique())-1,
               value=0,
               step=1),
    dcc.Graph(id="kerala_map"),
    dcc.Graph(id="trend_chart")
])

@app.callback(
    Output("kerala_map", "figure"),
    Input("variable", "value"),
    Input("time_slider", "value")
)
def update_map(variable, idx):
    dates = sorted(df["month_year"].unique())
    dff = df[df["month_year"] == dates[idx]]

    fig = px.choropleth_mapbox(
        dff,
        geojson=geojson,
        locations="district",
        featureidkey="properties.DISTRICT",
        color=variable,
        hover_name="district",
        zoom=6.5,
        center={"lat": 10.5, "lon": 76.3},
        mapbox_style="carto-positron"
    )
    return fig

@app.callback(
    Output("trend_chart", "figure"),
    Input("kerala_map", "clickData"),
    Input("variable", "value")
)
def trend(clickData, variable):
    district = "Wayanad"
    if clickData:
        district = clickData["points"][0]["location"]

    dff = df[df["district"] == district]

    fig = go.Figure()
    fig.add_trace(go.Scatter(x=dff["month_year"], y=dff[variable], mode="lines"))
    fig.update_layout(title=f"{district} Trend")
    return fig

if __name__ == "__main__":
    app.run(debug=True)
