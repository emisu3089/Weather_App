# BOM Unit Weather

A personal weather web page for Australian locations using Bureau of Meteorology data, with a simple Metric/Imperial unit toggle.

## Features

- Search by Australian city, suburb, or postcode.
- Choose from BOM location suggestions.
- View current conditions where available.
- View daily forecasts, up to the available BOM forecast range.
- View upcoming hourly forecast periods.
- Switch between Metric and Imperial units.
- Convert temperature, wind, rain, pressure, and common units in BOM forecast text.

## Run Locally

From the project folder:

```powershell
python -m http.server 8077 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8077/
```

## Data Source

This prototype uses the browser-facing BOM JSON API:

```text
https://api.weather.bom.gov.au/v1
```

It is intended for personal use and prototyping. If this app is later published or shared broadly, the data layer should be reviewed and likely moved to documented BOM feeds or a backend cache.

## Project Docs

- [CONTEXT.md](CONTEXT.md) explains the project goal, current features, and caveats.
- [INSTRUCTIONS.md](INSTRUCTIONS.md) includes local run steps and development notes.

