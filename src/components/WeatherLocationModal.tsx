import React, { useState } from 'react';
import { WeatherLocation, CurrentWeather, GeocodingResult } from '../types';
import {
  fetchCurrentWeather,
  searchCities,
  reverseGeocode,
  saveWeatherLocation,
  clearSavedWeatherLocation,
} from '../services/weatherService';
import {
  X,
  MapPin,
  Navigation,
  Search,
  RefreshCw,
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudFog,
  CloudLightning,
  Snowflake,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Sparkles,
  Compass,
  ArrowRight,
} from 'lucide-react';

interface WeatherLocationModalProps {
  location: WeatherLocation | null;
  weather: CurrentWeather | null;
  isOpen: boolean;
  onClose: () => void;
  onLocationSaved: (newLocation: WeatherLocation, newWeather: CurrentWeather) => void;
  onLocationRemoved: () => void;
  onRefreshWeather: () => Promise<void>;
  isRefreshingWeather?: boolean;
}

export const WeatherLocationModal: React.FC<WeatherLocationModalProps> = ({
  location,
  weather,
  isOpen,
  onClose,
  onLocationSaved,
  onLocationRemoved,
  onRefreshWeather,
  isRefreshingWeather = false,
}) => {
  // Mode: 'VIEW' (when location exists and user is inspecting details),
  // 'CHOOSE' (initial screen with 2 choices),
  // 'SEARCH' (manual city input view)
  const [viewMode, setViewMode] = useState<'VIEW' | 'CHOOSE' | 'SEARCH'>(() =>
    location ? 'VIEW' : 'CHOOSE'
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [isLocatingDevice, setIsLocatingDevice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  // Helper: Get appropriate weather icon
  const renderWeatherIcon = (code?: number, isDay: boolean = true) => {
    if (code === undefined) return <Sun className="w-8 h-8 text-[#D4AF37]" />;
    if (code === 0) {
      return isDay ? (
        <Sun className="w-8 h-8 text-[#D4AF37] animate-pulse" />
      ) : (
        <Sparkles className="w-8 h-8 text-[#D4AF37]" />
      );
    }
    if (code <= 3) return <CloudSun className="w-8 h-8 text-[#D4AF37]" />;
    if (code === 45 || code === 48) return <CloudFog className="w-8 h-8 text-stone-400" />;
    if (code >= 51 && code <= 67) return <CloudRain className="w-8 h-8 text-sky-400" />;
    if (code >= 71 && code <= 86) return <Snowflake className="w-8 h-8 text-sky-200" />;
    if (code >= 95) return <CloudLightning className="w-8 h-8 text-amber-400" />;
    return <Cloud className="w-8 h-8 text-stone-300" />;
  };

  // Option 1: Use Browser Geolocation
  const handleUseDeviceLocation = () => {
    setErrorMessage(null);
    setSuccessNotice(null);

    if (!navigator.geolocation) {
      setErrorMessage(
        'A geolocalização não é suportada pelo seu navegador atual. Por favor, escolha a localização manualmente.'
      );
      setViewMode('SEARCH');
      return;
    }

    setIsLocatingDevice(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          // Reverse geocode to get city name
          const placeName = await reverseGeocode(lat, lon);

          // Fetch real weather from Open-Meteo
          const weatherData = await fetchCurrentWeather(lat, lon);

          const newLocation: WeatherLocation = {
            latitude: lat,
            longitude: lon,
            name: placeName,
            type: 'current',
            savedAt: new Date().toISOString(),
          };

          saveWeatherLocation(newLocation);
          onLocationSaved(newLocation, weatherData);
          setIsLocatingDevice(false);
          setViewMode('VIEW');
          setSuccessNotice('Localização atual e temperatura configuradas com sucesso!');
        } catch (err: any) {
          setIsLocatingDevice(false);
          setErrorMessage(
            err.message ||
              'Não foi possível obter os dados meteorológicos para as coordenadas do dispositivo.'
          );
        }
      },
      (error) => {
        setIsLocatingDevice(false);
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMessage(
            'Permissão de localização não concedida pelo navegador. Você pode definir a localização do seu jardim informando o nome da cidade manualmente.'
          );
          setViewMode('SEARCH');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setErrorMessage(
            'Informações de localização indisponíveis no dispositivo no momento. Tente pesquisar sua cidade manualmente.'
          );
          setViewMode('SEARCH');
        } else if (error.code === error.TIMEOUT) {
          setErrorMessage(
            'Tempo limite esgotado ao buscar a localização. Tente novamente ou pesquise manualmente.'
          );
        } else {
          setErrorMessage(
            'Ocorreu uma falha ao consultar o GPS. Você pode escolher a cidade manualmente abaixo.'
          );
          setViewMode('SEARCH');
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 min
      }
    );
  };

  // Option 2: Search city manually
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length < 2) return;

    setIsSearching(true);
    setErrorMessage(null);
    setHasSearched(true);

    try {
      const results = await searchCities(searchQuery);
      setSearchResults(results);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao pesquisar cidades. Verifique sua conexão.');
    } finally {
      setIsSearching(false);
    }
  };

  // User selects a city from search results
  const handleSelectCity = async (city: GeocodingResult) => {
    setErrorMessage(null);
    setIsSearching(true);

    try {
      const weatherData = await fetchCurrentWeather(city.latitude, city.longitude);

      const newLocation: WeatherLocation = {
        latitude: city.latitude,
        longitude: city.longitude,
        name: city.formattedLabel,
        type: 'manual',
        savedAt: new Date().toISOString(),
      };

      saveWeatherLocation(newLocation);
      onLocationSaved(newLocation, weatherData);
      setViewMode('VIEW');
      setSuccessNotice(`Localização definida para ${city.name}!`);
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Não foi possível carregar a temperatura para a cidade selecionada.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  // Remove saved location
  const handleRemoveLocation = () => {
    clearSavedWeatherLocation();
    onLocationRemoved();
    setSearchResults([]);
    setSearchQuery('');
    setHasSearched(false);
    setViewMode('CHOOSE');
    setSuccessNotice('Localização removida. O aplicativo voltou ao modo padrão sem clima.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 border border-[#5A5A40]/30 shadow-2xl space-y-5 my-auto max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#5A5A40]/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#2D3A2D] text-[#D4AF37] flex items-center justify-center font-bold shadow-xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold text-[#2D3A2D]">
                Clima do Jardim
              </h3>
              <p className="text-xs text-[#5A5A40]">
                Temperatura atual para cuidados botânicos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#5A5A40] hover:text-[#2D3A2D] p-1.5 rounded-xl hover:bg-[#F5F5F0] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notices */}
        {errorMessage && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-xs text-red-900 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {successNotice && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-900 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{successNotice}</p>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 1: VIEW (Location is configured and weather is shown) */}
        {/* ======================================================== */}
        {viewMode === 'VIEW' && location && (
          <div className="space-y-5 animate-fadeIn">
            
            {/* Weather Card */}
            <div className="bg-gradient-to-br from-[#2D3A2D] via-[#243324] to-[#1a261a] text-[#F5F5F0] rounded-3xl p-5 sm:p-6 border border-[#D4AF37]/40 shadow-xl space-y-4 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#D4AF37]/15 rounded-full blur-xl pointer-events-none" />

              <div className="flex items-start justify-between gap-3 relative z-10">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold bg-[#D4AF37] text-[#2D3A2D] px-2.5 py-0.5 rounded-full">
                    <MapPin className="w-3 h-3 text-[#2D3A2D]" />
                    {location.type === 'current' ? 'Dispositivo' : 'Manual'}
                  </span>
                  <h4 className="font-serif font-bold text-lg sm:text-xl text-[#F5F5F0] leading-snug">
                    {location.name}
                  </h4>
                  <p className="text-[11px] text-[#F5F5F0]/70 font-mono">
                    Coord: {location.latitude.toFixed(2)}°, {location.longitude.toFixed(2)}°
                  </p>
                </div>

                <div className="text-right">
                  {renderWeatherIcon(weather?.weatherCode, weather?.isDay)}
                </div>
              </div>

              {/* Main Temperature & Condition */}
              {weather ? (
                <div className="pt-2 border-t border-[#5A5A40]/40 relative z-10 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="font-serif text-4xl sm:text-5xl font-bold text-[#F5F5F0]">
                        {weather.temperature}°C
                      </span>
                      <p className="text-xs text-[#D4AF37] font-semibold mt-0.5">
                        {weather.conditionText}
                      </p>
                    </div>

                    <div className="text-right text-xs text-[#F5F5F0]/80 space-y-1">
                      {weather.humidity !== undefined && (
                        <p>
                          Umidade do ar: <strong>{weather.humidity}%</strong>
                        </p>
                      )}
                      <p className="text-[11px] opacity-75">
                        Atualizado às {weather.observationTime}
                      </p>
                    </div>
                  </div>

                  {/* Botanical context advice */}
                  {weather.gardenInsight && (
                    <div className="mt-3 p-3 bg-[#182318]/90 rounded-2xl border border-[#D4AF37]/30 text-xs text-[#F5F5F0] space-y-1">
                      <span className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wider block">
                        Impacto no cultivo:
                      </span>
                      <p className="text-[#F5F5F0]/90 leading-relaxed font-medium">
                        {weather.gardenInsight}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-[#F5F5F0]/80">
                  Carregando dados meteorológicos...
                </div>
              )}

              {/* Source attribution */}
              <div className="pt-2 border-t border-[#5A5A40]/30 text-[10px] text-[#F5F5F0]/60 flex items-center justify-between">
                <span>Fonte: Open-Meteo.com</span>
                <span>Uso aberto e gratuito</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#5A5A40]/15">
              <button
                type="button"
                onClick={onRefreshWeather}
                disabled={isRefreshingWeather}
                className="px-3.5 py-2 bg-[#2D3A2D] hover:bg-[#1f291f] disabled:opacity-50 text-[#F5F5F0] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${isRefreshingWeather ? 'animate-spin' : ''}`} />
                {isRefreshingWeather ? 'Atualizando...' : 'Atualizar Clima'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('CHOOSE')}
                  className="px-3 py-2 bg-white hover:bg-[#F5F5F0] text-[#2D3A2D] rounded-xl text-xs font-semibold border border-[#5A5A40]/30 transition-colors cursor-pointer"
                >
                  Alterar Local
                </button>

                <button
                  type="button"
                  onClick={handleRemoveLocation}
                  className="p-2 text-red-700 hover:bg-red-50 rounded-xl text-xs font-semibold border border-red-200 transition-colors cursor-pointer"
                  title="Remover localização"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 2: CHOOSE (Initial Choice: Device vs Manual)        */}
        {/* ======================================================== */}
        {viewMode === 'CHOOSE' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="text-center space-y-1.5 py-1">
              <h4 className="font-serif font-bold text-lg text-[#2D3A2D]">
                Onde ficam as suas plantas?
              </h4>
              <p className="text-xs text-[#5A5A40] max-w-sm mx-auto leading-relaxed">
                A temperatura do local onde o jardim está instalado ajuda a estimar a taxa de evaporação e as necessidades de rega. Escolha como definir o local:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              
              {/* Choice 1: Device Geolocation */}
              <div
                onClick={handleUseDeviceLocation}
                className="bg-white hover:bg-[#FAF8F5] p-5 rounded-3xl border border-[#5A5A40]/30 hover:border-[#D4AF37] shadow-xs hover:shadow-md transition-all cursor-pointer space-y-3 group flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-[#5A5A40]/15 text-[#2D3A2D] flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                    <Navigation className="w-5 h-5 text-[#A68069]" />
                  </div>
                  <div>
                    <h5 className="font-serif font-bold text-sm text-[#2D3A2D]">
                      Usar minha localização
                    </h5>
                    <p className="text-[11px] text-[#5A5A40] mt-1 leading-relaxed">
                      Solicita permissão ao navegador para usar as coordenadas aproximadas do seu dispositivo.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isLocatingDevice}
                  className="w-full py-2 bg-[#2D3A2D] group-hover:bg-[#1f291f] text-[#F5F5F0] rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {isLocatingDevice ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />
                      Detectando...
                    </>
                  ) : (
                    <>
                      <span>Autorizar GPS</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                    </>
                  )}
                </button>
              </div>

              {/* Choice 2: Manual Search */}
              <div
                onClick={() => setViewMode('SEARCH')}
                className="bg-white hover:bg-[#FAF8F5] p-5 rounded-3xl border border-[#5A5A40]/30 hover:border-[#D4AF37] shadow-xs hover:shadow-md transition-all cursor-pointer space-y-3 group flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-[#5A5A40]/15 text-[#2D3A2D] flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                    <Search className="w-5 h-5 text-[#5A5A40]" />
                  </div>
                  <div>
                    <h5 className="font-serif font-bold text-sm text-[#2D3A2D]">
                      Escolher manualmente
                    </h5>
                    <p className="text-[11px] text-[#5A5A40] mt-1 leading-relaxed">
                      Pesquise pelo nome da cidade onde suas plantas estão cultivadas (ex: sítio, escritório ou casa).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="w-full py-2 bg-[#5A5A40] group-hover:bg-[#484833] text-[#F5F5F0] rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span>Buscar Cidade</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                </button>
              </div>

            </div>

            {location && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setViewMode('VIEW')}
                  className="text-xs text-[#5A5A40] hover:text-[#2D3A2D] underline font-medium cursor-pointer"
                >
                  ← Voltar para localização salva ({location.name.split(',')[0]})
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 3: SEARCH (Manual City Search Input & Results)      */}
        {/* ======================================================== */}
        {viewMode === 'SEARCH' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h4 className="font-serif font-bold text-base text-[#2D3A2D]">
                Pesquisar Cidade
              </h4>
              <button
                type="button"
                onClick={() => setViewMode(location ? 'VIEW' : 'CHOOSE')}
                className="text-xs text-[#5A5A40] hover:text-[#2D3A2D] underline font-medium cursor-pointer"
              >
                Voltar
              </button>
            </div>

            <form onSubmit={handleSearchSubmit} className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#5A5A40]" />
                <input
                  type="text"
                  placeholder="Digite o nome da cidade (ex: Curitiba, São Paulo, Porto)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#F5F5F0] border border-[#5A5A40]/30 rounded-2xl pl-10 pr-24 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069] font-medium"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isSearching || searchQuery.trim().length < 2}
                  className="absolute right-1.5 top-1.5 px-3 py-1 bg-[#2D3A2D] hover:bg-[#1f291f] disabled:opacity-40 text-[#F5F5F0] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  {isSearching ? 'Buscando...' : 'Pesquisar'}
                </button>
              </div>
              <p className="text-[10px] text-[#5A5A40]">
                Pressione Enter ou clique em Pesquisar para buscar cidades via Open-Meteo Geocoding.
              </p>
            </form>

            {/* Search Results List */}
            <div className="space-y-2 max-h-56 overflow-y-auto pt-1">
              {searchResults.map((city) => (
                <div
                  key={`${city.latitude}-${city.longitude}-${city.id}`}
                  onClick={() => handleSelectCity(city)}
                  className="bg-white hover:bg-[#FAF8F5] p-3 rounded-2xl border border-[#5A5A40]/20 hover:border-[#D4AF37] flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs group"
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin className="w-4 h-4 text-[#A68069] shrink-0 group-hover:scale-110 transition-transform" />
                    <div>
                      <p className="text-xs font-bold text-[#2D3A2D]">
                        {city.name}
                      </p>
                      <p className="text-[11px] text-[#5A5A40]">
                        {[city.admin1, city.country].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-bold text-[#A68069] group-hover:underline">
                    Selecionar →
                  </span>
                </div>
              ))}

              {hasSearched && searchResults.length === 0 && !isSearching && (
                <div className="p-4 text-center text-xs text-[#5A5A40] bg-[#F5F5F0] rounded-2xl border border-dashed border-[#5A5A40]/30">
                  Nenhuma cidade encontrada para &quot;{searchQuery}&quot;. Tente buscar apenas pelo nome da cidade sem abreviações.
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
