const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const BOM_BASE = "https://api.weather.bom.gov.au/v1";
const GEOCODING_BASE = "https://geocoding-api.open-meteo.com/v1";
const METSERVICE_BASE = "https://forecast-v2.metoceanapi.com";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

loadEnvFile();
const PORT = Number(process.env.PORT) || 8080;

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchJson(url, options = {}, label = "Weather service") {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(20000),
    headers: {
      accept: "application/json",
      "user-agent": "Weather-App/1.0 personal-use",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail = Array.isArray(payload)
      ? payload.join(" ")
      : payload?.message || payload?.error || String(payload || response.statusText);
    const error = new Error(`${label} returned ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function cached(key, loader, ttl = CACHE_TTL_MS) {
  const existing = cache.get(key);
  if (existing && Date.now() - existing.createdAt < ttl) return existing.value;
  const value = await loader();
  cache.set(key, { createdAt: Date.now(), value });
  return value;
}

function timezoneForAustralianState(state = "") {
  const timezones = {
    ACT: "Australia/Sydney",
    NSW: "Australia/Sydney",
    VIC: "Australia/Melbourne",
    QLD: "Australia/Brisbane",
    SA: "Australia/Adelaide",
    NT: "Australia/Darwin",
    TAS: "Australia/Hobart",
    WA: "Australia/Perth",
  };
  return timezones[state.toUpperCase()] || "Australia/Sydney";
}

function normalizeBomLocation(location) {
  return {
    id: `au:${location.geohash || location.id || location.name}`,
    provider: "bom",
    name: location.name,
    postcode: location.postcode || "",
    state: location.state || "",
    country: "Australia",
    countryCode: "AU",
    timezone: timezoneForAustralianState(location.state),
    geohash: location.geohash,
  };
}

function normalizeNzLocation(location) {
  const postcode = Array.isArray(location.postcodes)
    ? location.postcodes[0]
    : location.postcode || "";
  return {
    id: `nz:${Number(location.latitude).toFixed(5)}:${Number(location.longitude).toFixed(5)}`,
    provider: "metservice",
    name: location.name,
    postcode,
    state: location.admin1 || location.admin2 || "New Zealand",
    country: "New Zealand",
    countryCode: "NZ",
    timezone: location.timezone || "Pacific/Auckland",
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  };
}

async function searchBomLocations(query) {
  try {
    const payload = await fetchJson(
      `${BOM_BASE}/locations?search=${encodeURIComponent(query)}`,
      {},
      "BOM location search",
    );
    return (payload?.data || []).map(normalizeBomLocation);
  } catch {
    return [];
  }
}

async function searchNzLocations(query) {
  try {
    const url = new URL(`${GEOCODING_BASE}/search`);
    url.searchParams.set("name", query);
    url.searchParams.set("count", "12");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    url.searchParams.set("countryCode", "NZ");
    const payload = await fetchJson(url, {}, "Location search");
    return (payload?.results || [])
      .filter((item) => item.country_code === "NZ")
      .map(normalizeNzLocation);
  } catch {
    return [];
  }
}

function locationRank(location, query) {
  const needle = query.trim().toLowerCase();
  const name = String(location.name || "").toLowerCase();
  const postcode = String(location.postcode || "").toLowerCase();
  if (name === needle || postcode === needle) return 0;
  if (name.startsWith(needle) || postcode.startsWith(needle)) return 1;
  if (name.includes(needle) || postcode.includes(needle)) return 2;
  return 3;
}

async function searchLocations(query) {
  const [australian, newZealand] = await Promise.all([
    searchBomLocations(query),
    searchNzLocations(query),
  ]);
  const seen = new Set();
  return [...australian, ...newZealand]
    .filter((location) => {
      const key = `${location.countryCode}:${location.name}:${location.postcode}:${location.state}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => locationRank(a, query) - locationRank(b, query))
    .slice(0, 12);
}

function isNewZealandCoordinate(latitude, longitude) {
  const mainIslands = latitude >= -48 && latitude <= -33 && longitude >= 165 && longitude <= 180;
  const chathamIslands =
    latitude >= -45 && latitude <= -42 && longitude >= -178.5 && longitude <= -175;
  return mainIslands || chathamIslands;
}

async function nearbyLocations(latitude, longitude) {
  if (isNewZealandCoordinate(latitude, longitude)) {
    const isChatham = longitude < 0;
    return [
      {
        id: `nz:${latitude.toFixed(5)}:${longitude.toFixed(5)}`,
        provider: "metservice",
        name: "Nearby location",
        postcode: "",
        state: isChatham ? "Chatham Islands" : "New Zealand",
        country: "New Zealand",
        countryCode: "NZ",
        timezone: isChatham ? "Pacific/Chatham" : "Pacific/Auckland",
        latitude,
        longitude,
      },
    ];
  }
  return searchBomLocations(`${latitude.toFixed(4)},${longitude.toFixed(4)}`);
}

function geohashCandidates(location) {
  return [location.geohash, location.geohash?.slice(0, 6)]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

async function fetchBomPath(location, pathBuilder) {
  let lastError = null;
  for (const geohash of geohashCandidates(location)) {
    try {
      return await fetchJson(pathBuilder(geohash), {}, "BOM weather service");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No BOM geohash was supplied for this location.");
}

function normalizeBomWeather(location, observations, daily, hourly) {
  const observation = observations?.data || {};
  const dailyItems = daily?.data || [];
  const hourlyItems = hourly?.data || [];
  const forecastNow = dailyItems[0]?.now || {};
  const currentTemp =
    observation.temp ?? forecastNow.temp_now ?? hourlyItems[0]?.temp ?? dailyItems[0]?.temp_max;
  const currentUpdated =
    observations?.metadata?.observation_time ||
    observations?.metadata?.issue_time ||
    daily?.metadata?.issue_time ||
    null;

  return {
    provider: "Bureau of Meteorology",
    providerCode: "bom",
    countryCode: "AU",
    timezone: location.timezone,
    currentKind: "observation",
    issuedAt: daily?.metadata?.issue_time || null,
    hourlyIssuedAt: hourly?.metadata?.issue_time || null,
    updatedAt: currentUpdated,
    current: {
      temp: currentTemp,
      feelsLike: observation.temp_feels_like ?? hourlyItems[0]?.temp_feels_like ?? null,
      humidity: observation.humidity ?? null,
      windKmh: observation.wind?.speed_kilometre ?? null,
      windDirection: observation.wind?.direction || "",
      gustKmh:
        observation.gust?.speed_kilometre ??
        observation.max_gust?.speed_kilometre ??
        null,
      rainMm: observation.rain_since_9am ?? observation.rain_trace ?? null,
      pressureHpa: observation.pressure ?? observation.press ?? null,
      stationName: observation.station?.name || "",
      descriptor:
        dailyItems[0]?.icon_descriptor || hourlyItems[0]?.icon_descriptor || "cloudy",
      summary: dailyItems[0]?.short_text || "Current conditions",
      detail:
        dailyItems[0]?.extended_text || "Latest BOM observation for this location.",
    },
    daily: dailyItems.map((item) => ({
      date: item.date,
      tempMax: item.temp_max ?? null,
      tempMin: item.temp_min ?? null,
      rainChance: item.rain?.chance ?? null,
      rainAmountMm: item.rain?.amount?.max ?? item.rain?.amount?.min ?? null,
      descriptor: item.icon_descriptor || "cloudy",
      summary: item.short_text || item.extended_text || "",
      detail: item.extended_text || "",
    })),
    hourly: hourlyItems.map((item) => ({
      time: item.time,
      temp: item.temp ?? null,
      feelsLike: item.temp_feels_like ?? null,
      humidity: item.humidity ?? null,
      windKmh: item.wind?.speed_kilometre ?? null,
      windDirection: item.wind?.direction || "",
      rainChance: item.rain?.chance ?? null,
      rainAmountMm: item.rain?.amount?.max ?? item.rain?.amount?.min ?? null,
      descriptor: item.icon_descriptor || "cloudy",
    })),
  };
}

async function loadBomWeather(location) {
  const [observationResult, dailyResult, hourlyResult] = await Promise.allSettled([
    fetchBomPath(location, (hash) => `${BOM_BASE}/locations/${hash}/observations`),
    fetchBomPath(location, (hash) => `${BOM_BASE}/locations/${hash}/forecasts/daily`),
    fetchBomPath(location, (hash) => `${BOM_BASE}/locations/${hash}/forecasts/hourly`),
  ]);
  const observations = observationResult.status === "fulfilled" ? observationResult.value : null;
  const daily = dailyResult.status === "fulfilled" ? dailyResult.value : null;
  const hourly = hourlyResult.status === "fulfilled" ? hourlyResult.value : null;
  if (!observations && !daily && !hourly) {
    throw new Error("BOM returned no weather data for this location.");
  }
  return normalizeBomWeather(location, observations, daily, hourly);
}

const metserviceVariableCandidates = {
  temperature: ["air.temperature.at-2m", "air.temperature.at-surface"],
  humidity: ["air.humidity.at-2m", "relative.humidity.at-2m"],
  pressure: ["air.pressure.at-sea-level"],
  cloud: ["cloud.cover"],
  precipitation: ["precipitation.rate", "precipitation.amount"],
  windSpeed: ["wind.speed.at-10m"],
  windDirection: ["wind.direction.at-10m"],
  gust: ["wind.speed.gust.at-10m", "wind.gust.at-10m", "wind.speed.gust"],
};

async function metserviceVariables(apiKey) {
  try {
    return await cached(
      "metservice:variables",
      () =>
        fetchJson(
          `${METSERVICE_BASE}/variables/`,
          { headers: { "x-api-key": apiKey } },
          "MetService variable catalog",
        ),
      24 * 60 * 60 * 1000,
    );
  } catch {
    return null;
  }
}

function selectMetserviceVariables(catalog) {
  const selected = {};
  for (const [purpose, candidates] of Object.entries(metserviceVariableCandidates)) {
    selected[purpose] = catalog
      ? candidates.find((candidate) => candidate in catalog) || null
      : candidates[0];
  }
  return selected;
}

function variableSeries(payload, variableName) {
  if (!variableName) return { data: [], units: "" };
  const variable = payload?.variables?.[variableName];
  return {
    data: Array.isArray(variable?.data) ? variable.data : [],
    units: variable?.units || "",
  };
}

function asNumber(value) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return null;
  return Number(value);
}

function temperatureC(value, units) {
  const number = asNumber(value);
  if (number == null) return null;
  if (/fahrenheit/i.test(units)) return (number - 32) / 1.8;
  if (/kelvin/i.test(units)) return number - 273.15;
  return number;
}

function percentValue(value) {
  const number = asNumber(value);
  if (number == null) return null;
  return Math.max(0, Math.min(100, Math.abs(number) <= 1.5 ? number * 100 : number));
}

function windKmh(value, units) {
  const number = asNumber(value);
  if (number == null) return null;
  if (/meterpersecond|m\/s/i.test(units)) return number * 3.6;
  if (/knot/i.test(units)) return number * 1.852;
  if (/mileperhour|mph/i.test(units)) return number / 0.621371;
  return number;
}

function pressureHpa(value, units) {
  const number = asNumber(value);
  if (number == null) return null;
  if (/pascal/i.test(units) && !/hecto/i.test(units)) return number / 100;
  return number;
}

function precipitationMmPerHour(value, units) {
  const number = asNumber(value);
  if (number == null) return null;
  const normalizedUnits = String(units).toLowerCase();
  if (normalizedUnits.includes("persecond")) {
    if (normalizedUnits === "meterpersecond") return number * 3600 * 1000;
    return number * 3600;
  }
  if (normalizedUnits === "meterperhour") return number * 1000;
  return number;
}

function cardinalDirection(value) {
  const number = asNumber(value);
  if (number == null) return "";
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round((((number % 360) + 360) % 360) / 45) % 8];
}

function localDateKey(value, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function weatherDescription(precipitation, cloud) {
  if ((precipitation ?? 0) >= 2.5) {
    return { descriptor: "rain", summary: "Heavy rain" };
  }
  if ((precipitation ?? 0) >= 0.1) {
    return { descriptor: "rain", summary: "Rain" };
  }
  if ((cloud ?? 0) >= 85) {
    return { descriptor: "cloudy", summary: "Cloudy" };
  }
  if ((cloud ?? 0) >= 55) {
    return { descriptor: "cloudy", summary: "Mostly cloudy" };
  }
  if ((cloud ?? 0) >= 25) {
    return { descriptor: "partly cloudy", summary: "Partly cloudy" };
  }
  return { descriptor: "sunny", summary: "Mostly sunny" };
}

function metserviceTimes(payload) {
  const dimensions = payload?.dimensions || {};
  const dimension =
    dimensions.time ||
    dimensions.times ||
    Object.values(dimensions).find((item) => item?.type === "time");
  return Array.isArray(dimension?.data) ? dimension.data : [];
}

function normalizeMetserviceWeather(location, payload, selectedVariables) {
  const times = metserviceTimes(payload);
  if (!times.length) throw new Error("MetService returned no forecast times for this location.");

  const temperature = variableSeries(payload, selectedVariables.temperature);
  const humidity = variableSeries(payload, selectedVariables.humidity);
  const pressureSeries = variableSeries(payload, selectedVariables.pressure);
  const cloud = variableSeries(payload, selectedVariables.cloud);
  const precipitation = variableSeries(payload, selectedVariables.precipitation);
  const windSpeedSeries = variableSeries(payload, selectedVariables.windSpeed);
  const windDirection = variableSeries(payload, selectedVariables.windDirection);
  const gust = variableSeries(payload, selectedVariables.gust);

  const hourly = times.map((time, index) => {
    const rainAmountMm = precipitationMmPerHour(
      precipitation.data[index],
      precipitation.units,
    );
    const cloudCover = percentValue(cloud.data[index]);
    const description = weatherDescription(rainAmountMm, cloudCover);
    return {
      time,
      temp: temperatureC(temperature.data[index], temperature.units),
      feelsLike: null,
      humidity: percentValue(humidity.data[index]),
      pressureHpa: pressureHpa(pressureSeries.data[index], pressureSeries.units),
      cloudCover,
      windKmh: windKmh(windSpeedSeries.data[index], windSpeedSeries.units),
      windDirection: cardinalDirection(windDirection.data[index]),
      gustKmh: windKmh(gust.data[index], gust.units),
      rainChance: null,
      rainAmountMm,
      descriptor: description.descriptor,
      summary: description.summary,
    };
  });

  const groups = new Map();
  for (const item of hourly) {
    const key = localDateKey(item.time, location.timezone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const daily = [...groups.entries()].slice(0, 10).map(([date, items]) => {
    const temperatures = items.map((item) => item.temp).filter((value) => value != null);
    const rainAmounts = items.map((item) => item.rainAmountMm).filter((value) => value != null);
    const cloudAmounts = items.map((item) => item.cloudCover).filter((value) => value != null);
    const rainAmountMm = rainAmounts.reduce((total, value) => total + value, 0);
    const averageCloud = cloudAmounts.length
      ? cloudAmounts.reduce((total, value) => total + value, 0) / cloudAmounts.length
      : null;
    const description = weatherDescription(
      rainAmounts.length ? Math.max(...rainAmounts) : null,
      averageCloud,
    );
    return {
      date,
      tempMax: temperatures.length ? Math.max(...temperatures) : null,
      tempMin: temperatures.length ? Math.min(...temperatures) : null,
      rainChance: null,
      rainAmountMm: rainAmounts.length ? rainAmountMm : null,
      descriptor: description.descriptor,
      summary: description.summary,
      detail: "MetService point forecast model aggregation.",
    };
  });

  const current = hourly[0];
  return {
    provider: "MetService",
    providerCode: "metservice",
    countryCode: "NZ",
    timezone: location.timezone,
    currentKind: "forecast",
    issuedAt: null,
    hourlyIssuedAt: null,
    updatedAt: new Date().toISOString(),
    current: {
      temp: current.temp,
      feelsLike: current.feelsLike,
      humidity: current.humidity,
      windKmh: current.windKmh,
      windDirection: current.windDirection,
      gustKmh: current.gustKmh,
      rainMm: current.rainAmountMm,
      pressureHpa: current.pressureHpa,
      stationName: "",
      descriptor: current.descriptor,
      summary: current.summary,
      detail:
        "Forecast model estimate for the current hour. Live observations require a separate MetService API product.",
    },
    daily,
    hourly,
  };
}

async function loadMetserviceWeather(location) {
  const apiKey = process.env.METSERVICE_API_KEY;
  if (!apiKey) {
    const error = new Error(
      "New Zealand forecasts need a MetService Point Forecast API key. Add METSERVICE_API_KEY to a local .env file and restart the server.",
    );
    error.status = 503;
    error.code = "METSERVICE_KEY_REQUIRED";
    throw error;
  }

  const catalog = await metserviceVariables(apiKey);
  const selected = selectMetserviceVariables(catalog);
  const variables = [...new Set(Object.values(selected).filter(Boolean))];
  const from = new Date();
  from.setUTCMinutes(0, 0, 0);
  const url = new URL(`${METSERVICE_BASE}/point/time`);
  url.searchParams.set("lat", String(location.latitude));
  url.searchParams.set("lon", String(location.longitude));
  url.searchParams.set("variables", variables.join(","));
  url.searchParams.set("from", from.toISOString());
  url.searchParams.set("interval", "1h");
  url.searchParams.set("repeat", "239");
  url.searchParams.set("outputFormat", "number");

  const payload = await fetchJson(
    url,
    { headers: { "x-api-key": apiKey } },
    "MetService point forecast",
  );
  return normalizeMetserviceWeather(location, payload, selected);
}

function validateLocation(searchParams) {
  const countryCode = String(searchParams.get("country") || "").toUpperCase();
  const common = {
    name: searchParams.get("name") || "Selected location",
    postcode: searchParams.get("postcode") || "",
    state: searchParams.get("state") || "",
    countryCode,
    timezone: searchParams.get("timezone") ||
      (countryCode === "NZ" ? "Pacific/Auckland" : "Australia/Sydney"),
  };
  if (countryCode === "AU") {
    const geohash = searchParams.get("geohash");
    if (!geohash) throw new Error("An Australian BOM geohash is required.");
    return { ...common, provider: "bom", geohash };
  }
  if (countryCode === "NZ") {
    const latitude = Number(searchParams.get("lat"));
    const longitude = Number(searchParams.get("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("New Zealand latitude and longitude are required.");
    }
    return { ...common, provider: "metservice", latitude, longitude };
  }
  throw new Error("Only Australian and New Zealand locations are supported.");
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/locations") {
    const hasCoordinates = url.searchParams.has("lat") && url.searchParams.has("lon");
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));
    if (hasCoordinates && Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const results = await nearbyLocations(latitude, longitude);
      return sendJson(response, 200, { data: results });
    }
    const query = String(url.searchParams.get("search") || "").trim();
    if (query.length < 2) return sendJson(response, 200, { data: [] });
    const results = await cached(`locations:${query.toLowerCase()}`, () => searchLocations(query));
    return sendJson(response, 200, { data: results });
  }

  if (url.pathname === "/api/weather") {
    const location = validateLocation(url.searchParams);
    const key =
      location.countryCode === "AU"
        ? `weather:au:${location.geohash}`
        : `weather:nz:${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`;
    const weather = await cached(key, () =>
      location.countryCode === "AU"
        ? loadBomWeather(location)
        : loadMetserviceWeather(location),
    );
    return sendJson(response, 200, { data: weather });
  }

  return sendJson(response, 404, { error: "API route not found." });
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  }[extension] || "application/octet-stream";
}

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(ROOT, `.${decodeURIComponent(requested)}`);
  const rootPrefix = `${ROOT.toLowerCase()}${path.sep}`;
  if (filePath.toLowerCase() !== ROOT.toLowerCase() && !filePath.toLowerCase().startsWith(rootPrefix)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      return response.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
    response.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-cache",
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    serveStatic(response, url.pathname);
  } catch (error) {
    const status = Number(error.status) || 500;
    sendJson(response, status, {
      error: errorMessage(error),
      code: error.code || "REQUEST_FAILED",
    });
  }
});

if (require.main === module) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Weather App running at http://127.0.0.1:${PORT}/`);
    if (!process.env.METSERVICE_API_KEY) {
      console.log("METSERVICE_API_KEY is not configured. Australian weather remains available.");
    }
  });
}

module.exports = {
  cardinalDirection,
  localDateKey,
  normalizeMetserviceWeather,
  precipitationMmPerHour,
  searchBomLocations,
  searchLocations,
  searchNzLocations,
  selectMetserviceVariables,
  weatherDescription,
};
