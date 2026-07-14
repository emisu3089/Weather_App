# AU and NZ Unit Weather Instructions

## Local Setup

Node.js 18 or newer is required.

Create a private environment file from the included example:

```powershell
Copy-Item .env.example .env
```

Add a MetService Point Forecast key:

```text
METSERVICE_API_KEY=your_key_here
```

Do not commit `.env`. It is excluded by `.gitignore`.

Start the local server:

```powershell
node server.js
```

Open:

```text
http://127.0.0.1:8080/
```

## Use The App

1. Enter an Australian city, suburb, or postcode, or a New Zealand place name.
2. Choose a result identified by `AU` or `NZ`.
3. Use Metric or Imperial to change units.
4. Use 12 h or 24 h to change time display.
5. Use Nearby to request browser location access.

New Zealand place search works without a MetService key. New Zealand weather requires the key, while Australian BOM weather does not.

## Development Notes

- Keep provider credentials and upstream API requests in `server.js`.
- Keep browser rendering dependent on the normalized weather response, not a provider-specific payload.
- Label model estimates separately from observations.
- Preserve provider attribution in the current weather panel.
- Keep unit conversion functions small and covered by tests.
- Do not imply that MetService raw model output is identical to its curated website forecast.
- Review current provider terms before deployment or distribution.

## Test

Run:

```powershell
npm.cmd test
```

## GitHub

The repository remote is:

```text
https://github.com/emisu3089/Weather_App.git
```
