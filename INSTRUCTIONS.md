# BOM Unit Weather Instructions

## Run Locally

From the project folder:

```powershell
python -m http.server 8077 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8077/
```

You can also open `index.html` directly in a browser, but using the local server is closer to how the page behaves when hosted.

## Use The App

1. Enter a city, suburb, or postcode.
2. Choose a matching BOM location from the suggestions.
3. Use the Metric or Imperial toggle to change units.
4. Use Nearby if you want the browser to request your location and search for a nearby BOM location.

## Development Notes

- Keep data-fetching logic isolated in JavaScript helper functions so a backend provider can replace the current API later.
- Keep unit conversion functions small and testable.
- Keep BOM wording intact where conversion would be misleading, such as warnings, UV category, and fire danger text.
- Cache data if a backend is added.
- Preserve attribution to the Bureau of Meteorology.

## GitHub Push

The local repository has `origin` set to:

```text
https://github.com/emisu3089/Weather_App.git
```

Create an empty GitHub repository named `Weather_App` under the `emisu3089` account, then push with:

```powershell
git push -u origin main
```

