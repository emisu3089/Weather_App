# AU and NZ Unit Weather Context

## Project Goal

AU and NZ Unit Weather is a personal web app for checking Australian and New Zealand weather while choosing Metric or Imperial units and a 12-hour or 24-hour clock.

## Current Features

- Search Australian cities, suburbs, and postcodes plus New Zealand place names in one field.
- Use BOM location results and weather for Australia.
- Use Open-Meteo geocoding and MetService Point Forecast data for New Zealand.
- Show BOM current observations where available.
- Show the nearest New Zealand hourly model forecast as a current forecast, not as a live observation.
- Show up to 10 available daily periods and 12 upcoming hourly periods.
- Convert temperature, wind speed, rain amount, pressure, and common units embedded in BOM narrative text.
- Persist the last selected location, units, and clock preference in browser local storage.

## Architecture

`server.js` serves the page and exposes two same-origin routes:

```text
GET /api/locations
GET /api/weather
```

The server routes each selected location by country and normalizes both providers into one browser response shape. It also caches successful upstream responses for 10 minutes and keeps `METSERVICE_API_KEY` outside browser code.

`index.html` contains the interface, unit conversions, local preference storage, and rendering code.

## Provider Behavior

### Australia

The app uses the browser-facing BOM JSON service at:

```text
https://api.weather.bom.gov.au/v1
```

This is not a documented public developer API. BOM responses currently include a notice that restricts use, copying, and sharing. The integration should therefore remain a personal prototype unless its use is reviewed against current BOM data access options and terms.

### New Zealand

The app uses the authenticated MetService Point Forecast endpoint at:

```text
https://forecast-v2.metoceanapi.com/point/time
```

The Point Forecast API supplies raw deterministic model data for up to a 10-day forecast horizon. It does not mirror the curated consumer forecast exactly. Live observations are available through a separate MetService API product, so the app labels its New Zealand current panel as a forecast.

New Zealand place-name search uses the Open-Meteo Geocoding API and filters results to country code `NZ`. Testing showed that its New Zealand postcode coverage is not sufficient, so the interface only promises postcode lookup for Australia.

## Known Caveats

- The BOM browser API can change or become unavailable without notice.
- BOM usage requirements need review before publication or distribution.
- A MetService Point Forecast key is required for New Zealand weather data.
- MetService variable availability can depend on the account plan and available models.
- Raw model data can differ from forecasts shown on the MetService website.
- Some optional metrics can be unavailable and display as `--`.
- Browser geolocation requires permission and only supports nearby use within Australia or New Zealand.
