# BOM Unit Weather Context

## Project Goal

BOM Unit Weather is a personal web page for checking Australian weather from Bureau of Meteorology data while choosing between Metric and Imperial units.

The first version is intentionally a single static page so it is easy to run, inspect, and change before deciding whether to build a backend or mobile app.

## Current Features

- Search by Australian city, suburb, or postcode.
- Select from BOM location suggestions.
- Show current conditions where available.
- Show daily forecast data, up to the available BOM forecast range.
- Show upcoming hourly forecast periods.
- Toggle between Metric and Imperial units.
- Toggle between 12-hour and 24-hour clock formats.
- Convert temperature, wind speed, rain amount, pressure, and common units embedded in BOM narrative forecast text.
- Persist the last selected location, unit preference, and clock preference in browser local storage.

## Data Source

The app currently uses the browser-facing BOM JSON API at:

```text
https://api.weather.bom.gov.au/v1
```

This is suitable for a personal prototype, but it should be treated as an unofficial integration. If the app is later published or shared broadly, consider switching to documented BOM data feeds or adding a backend cache/proxy with appropriate terms-of-use review.

## Main File

```text
index.html
```

The page currently contains all HTML, CSS, and JavaScript in one file.

## Known Caveats

- The BOM web API can change without warning.
- The page depends on direct browser access to BOM endpoints.
- Some observation metrics may be unavailable for a location and display as `--`.
- Browser geolocation may not work from every local serving context or without user permission.
- The current design is optimized for quick personal use, not yet for app-store distribution or public hosting.
