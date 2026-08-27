import type { WeatherSnapshot } from '@/types';

interface BrowserCoordinates {
  latitude: number;
  longitude: number;
}

interface OpenMeteoResponse {
  latitude?: number;
  longitude?: number;
  current?: Record<string, number | string | null | undefined>;
  hourly?: Record<string, (number | string | null)[] | undefined>;
}

const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export async function getInspectionWeather(): Promise<WeatherSnapshot> {
  const capturedAt = new Date().toISOString();

  try {
    const coords = await getBrowserCoordinates();
    return await fetchOpenMeteoWeather(coords, capturedAt);
  } catch (err) {
    return {
      latitude: 0,
      longitude: 0,
      source: 'open-meteo',
      captured_at: capturedAt,
      temperature_c: null,
      humidity_pct: null,
      precipitation_mm: null,
      rain_mm: null,
      showers_mm: null,
      wind_speed_kmh: null,
      wind_gusts_kmh: null,
      weather_code: null,
      cloud_cover_pct: null,
      forecast_24h_precipitation_mm: null,
      forecast_24h_precipitation_probability_max_pct: null,
      error: err instanceof Error ? err.message : 'Weather lookup failed.',
    };
  }
}

function getBrowserCoordinates(): Promise<BrowserCoordinates> {
  if (!('geolocation' in navigator)) {
    return Promise.reject(new Error('Browser GPS is not available on this device.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(`GPS permission or location lookup failed: ${error.message}`));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      }
    );
  });
}

async function fetchOpenMeteoWeather(
  coords: BrowserCoordinates,
  capturedAt: string
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: coords.latitude.toFixed(6),
    longitude: coords.longitude.toFixed(6),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation',
      'rain',
      'showers',
      'weather_code',
      'cloud_cover',
      'wind_speed_10m',
      'wind_gusts_10m',
    ].join(','),
    hourly: 'precipitation,precipitation_probability',
    forecast_days: '2',
    timezone: 'auto',
  });

  let response: Response;
  try {
    response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`);
  } catch (err) {
    throw new Error(`Cannot reach Open-Meteo weather API. ${err instanceof Error ? err.message : 'Network error.'}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Open-Meteo weather lookup failed (HTTP ${response.status}). ${body}`);
  }

  const data = (await response.json().catch(() => {
    throw new Error('Open-Meteo returned invalid JSON.');
  })) as OpenMeteoResponse;

  const current = data.current ?? {};
  const hourly = data.hourly ?? {};
  const next24Precipitation = sumFirstNumbers(hourly.precipitation, 24);
  const next24Probability = maxFirstNumbers(hourly.precipitation_probability, 24);

  return {
    latitude: data.latitude ?? coords.latitude,
    longitude: data.longitude ?? coords.longitude,
    source: 'open-meteo',
    captured_at: capturedAt,
    temperature_c: readNumber(current.temperature_2m),
    humidity_pct: readNumber(current.relative_humidity_2m),
    precipitation_mm: readNumber(current.precipitation),
    rain_mm: readNumber(current.rain),
    showers_mm: readNumber(current.showers),
    wind_speed_kmh: readNumber(current.wind_speed_10m),
    wind_gusts_kmh: readNumber(current.wind_gusts_10m),
    weather_code: readNumber(current.weather_code),
    cloud_cover_pct: readNumber(current.cloud_cover),
    forecast_24h_precipitation_mm: next24Precipitation,
    forecast_24h_precipitation_probability_max_pct: next24Probability,
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sumFirstNumbers(values: unknown, count: number): number | null {
  if (!Array.isArray(values)) return null;
  const total = values.slice(0, count).reduce((sum, value) => {
    return typeof value === 'number' && Number.isFinite(value) ? sum + value : sum;
  }, 0);
  return Number(total.toFixed(2));
}

function maxFirstNumbers(values: unknown, count: number): number | null {
  if (!Array.isArray(values)) return null;
  const nums = values
    .slice(0, count)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return nums.length > 0 ? Math.max(...nums) : null;
}
