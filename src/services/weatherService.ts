import { WeatherLocation, CurrentWeather, GeocodingResult } from '../types';

const STORAGE_KEY_LOCATION = 'jardim_weather_location_v1';
const STORAGE_KEY_WEATHER_CACHE = 'jardim_weather_cache_v1';

export interface WeatherCacheEntry {
  weather: CurrentWeather;
  cachedAt: number; // timestamp
}

/**
 * Loads the saved weather location from localStorage.
 */
export function getSavedWeatherLocation(): WeatherLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCATION);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.latitude === 'number' &&
        typeof parsed.longitude === 'number' &&
        typeof parsed.name === 'string'
      ) {
        return parsed as WeatherLocation;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar localização do clima do localStorage:', err);
  }
  return null;
}

/**
 * Saves the selected location to localStorage.
 */
export function saveWeatherLocation(location: WeatherLocation): void {
  try {
    localStorage.setItem(STORAGE_KEY_LOCATION, JSON.stringify(location));
  } catch (err) {
    console.warn('Erro ao salvar localização do clima no localStorage:', err);
  }
}

/**
 * Clears the saved location and cache from localStorage.
 */
export function clearSavedWeatherLocation(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_LOCATION);
    localStorage.removeItem(STORAGE_KEY_WEATHER_CACHE);
  } catch (err) {
    console.warn('Erro ao limpar localização do clima:', err);
  }
}

/**
 * Gets cached weather if it is younger than 30 minutes.
 */
export function getCachedWeather(): CurrentWeather | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WEATHER_CACHE);
    if (raw) {
      const entry: WeatherCacheEntry = JSON.parse(raw);
      const THIRTY_MINUTES_MS = 30 * 60 * 1000;
      if (Date.now() - entry.cachedAt < THIRTY_MINUTES_MS) {
        return entry.weather;
      }
    }
  } catch {
    // Cache miss or parse error
  }
  return null;
}

/**
 * Saves current weather to cache.
 */
export function cacheWeather(weather: CurrentWeather): void {
  try {
    const entry: WeatherCacheEntry = {
      weather,
      cachedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY_WEATHER_CACHE, JSON.stringify(entry));
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetches real-time current weather from the backend proxy (Open-Meteo).
 */
export async function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  const response = await fetch(`/api/weather/current?lat=${lat}&lon=${lon}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Não foi possível consultar os dados meteorológicos.');
  }

  cacheWeather(data.data);
  return data.data as CurrentWeather;
}

/**
 * Searches for cities via the backend geocoding proxy (Open-Meteo Geocoding).
 */
export async function searchCities(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const response = await fetch(`/api/weather/search?q=${encodeURIComponent(trimmed)}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Falha ao buscar cidades.');
  }

  return (data.results || []) as GeocodingResult[];
}

/**
 * Reverse geocodes coordinates to a friendly place name via backend proxy.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const response = await fetch(`/api/weather/reverse?lat=${lat}&lon=${lon}`);
    const data = await response.json();
    if (response.ok && data.success && data.name) {
      return data.name;
    }
  } catch (err) {
    console.warn('Falha na geocodificação reversa:', err);
  }
  return `Local (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`;
}
