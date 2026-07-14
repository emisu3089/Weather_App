# AU and NZ Unit Weather

A personal weather web page for Australian and New Zealand locations with Metric and Imperial units, plus 12-hour and 24-hour clocks.

## Features

- Search by Australian city, suburb, or postcode, or by New Zealand place name.
- Route Australian locations to Bureau of Meteorology data.
- Route New Zealand locations to the MetService Point Forecast API.
- View current BOM observations where available.
- View a clearly labeled current-hour model forecast for New Zealand.
- View up to 10 available daily forecast periods and upcoming hourly periods.
- Convert temperature, wind, rain, pressure, and common units in BOM forecast text.
- Keep the MetService key on the local server instead of exposing it in browser JavaScript.

## Requirements

- Node.js 18 or newer.
- A MetService Point Forecast API key for New Zealand forecasts.

MetService provides self-service Point Forecast API access through its [API console](https://console.metoceanapi.com/). Its current documentation describes the Starter plan as suitable for prototyping, testing, and proof-of-concept work. Check the current plan and terms before using the app outside personal local testing.

## Run Locally

1. Create the local environment file:

```powershell
Copy-Item .env.example .env
```

2. Add your key to `.env`:

```text
METSERVICE_API_KEY=your_key_here
```

3. Start the app:

```powershell
node server.js
```

4. Open `http://127.0.0.1:8080/`.

Australian weather remains available when no MetService key is configured. New Zealand searches also work, but selecting a New Zealand result displays a key setup message.

## Data Sources

- Australian locations and weather: `https://api.weather.bom.gov.au/v1`
- New Zealand point forecasts: `https://forecast-v2.metoceanapi.com/point/time`
- New Zealand place search: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)

The BOM endpoint used here is a browser-facing API, not a documented public developer API. Its response includes a restrictive usage notice, and the endpoint can change without warning. Review [BOM Data Services](https://www.bom.gov.au/resources/data-services) before publishing or distributing an app that relies on it.

MetService Point Forecast data is raw forecast model output. MetService states that it can differ from the meteorologist-curated forecast shown on its consumer website and app. Live MetService observations require a separate API product, so this app does not present the current-hour New Zealand forecast as an observation.

## Project Docs

- [CONTEXT.md](CONTEXT.md) explains the architecture, provider behavior, and caveats.
- [INSTRUCTIONS.md](INSTRUCTIONS.md) includes setup, use, and development notes.
