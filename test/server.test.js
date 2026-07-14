const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cardinalDirection,
  normalizeMetserviceWeather,
  precipitationMmPerHour,
  selectMetserviceVariables,
  weatherDescription,
} = require("../server");

test("selects supported MetService variable names", () => {
  const selected = selectMetserviceVariables({
    "air.temperature.at-2m": {},
    "air.humidity.at-2m": {},
    "air.pressure.at-sea-level": {},
    "cloud.cover": {},
    "precipitation.rate": {},
    "wind.speed.at-10m": {},
    "wind.direction.at-10m": {},
  });

  assert.equal(selected.temperature, "air.temperature.at-2m");
  assert.equal(selected.precipitation, "precipitation.rate");
  assert.equal(selected.gust, null);
});

test("converts forecast units used by the MetService response", () => {
  assert.equal(precipitationMmPerHour(0.001, "kilogramPerSquareMeterPerSecond"), 3.6);
  assert.equal(cardinalDirection(225), "SW");
  assert.deepEqual(weatherDescription(0.5, 90), {
    descriptor: "rain",
    summary: "Rain",
  });
});

test("normalizes MetService hourly and daily forecasts", () => {
  const payload = {
    dimensions: {
      time: {
        type: "time",
        data: ["2026-07-14T00:00:00Z", "2026-07-14T01:00:00Z"],
      },
    },
    variables: {
      "air.temperature.at-2m": { units: "degreeC", data: [12, 14] },
      "air.humidity.at-2m": { units: "percent", data: [80, 75] },
      "air.pressure.at-sea-level": { units: "pascal", data: [101200, 101100] },
      "cloud.cover": { units: "percent", data: [90, 70] },
      "precipitation.rate": {
        units: "kilogramPerSquareMeterPerSecond",
        data: [0, 0.001],
      },
      "wind.speed.at-10m": { units: "meterPerSecond", data: [5, 6] },
      "wind.direction.at-10m": { units: "degree", data: [180, 225] },
    },
  };
  const selected = selectMetserviceVariables(
    Object.fromEntries(Object.keys(payload.variables).map((name) => [name, {}])),
  );
  const weather = normalizeMetserviceWeather(
    { timezone: "Pacific/Auckland" },
    payload,
    selected,
  );

  assert.equal(weather.provider, "MetService");
  assert.equal(weather.current.pressureHpa, 1012);
  assert.equal(weather.current.windKmh, 18);
  assert.equal(weather.hourly[1].rainAmountMm, 3.6);
  assert.equal(weather.daily.length, 1);
  assert.equal(weather.daily[0].tempMax, 14);
});
