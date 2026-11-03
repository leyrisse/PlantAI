import React from 'react';
import { Leaf, Sun, Droplets, Plus, HelpCircle, MapPin } from 'lucide-react';
import { WeatherLocation, CurrentWeather } from '../types';

interface HeaderProps {
  onOpenNewPlantModal: () => void;
  onOpenWelcomeModal?: () => void;
  onOpenWeatherModal?: () => void;
  weatherLocation?: WeatherLocation | null;
  currentWeather?: CurrentWeather | null;
  userId?: string | null;
  isAnonymous?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewPlantModal,
  onOpenWelcomeModal,
  onOpenWeatherModal,
  weatherLocation,
  currentWeather,
  userId,
  isAnonymous,
}) => {
  return (
    <header className="bg-[#2D3A2D] text-[#F5F5F0] border-b border-[#5A5A40]/60 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3 sm:gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#5A5A40] flex items-center justify-center shadow-lg text-[#D4AF37] font-bold border border-[#A68069]/40 shrink-0">
              <Leaf className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#F5F5F0]">
                  PlantAI
                </h1>
                {userId && (
                  <span
                    className="hidden md:inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#5A5A40]/50 text-[#D4AF37] border border-[#D4AF37]/30"
                    title={`Identidade do visitante: ${userId}`}
                  >
                    {isAnonymous ? 'Visitante' : 'Conectado'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#F5F5F0]/70 hidden sm:block">
                Identificação botânica e cuidados do seu jardim
              </p>
            </div>
          </div>

          {/* Dynamic Weather Widget Context */}
          {onOpenWeatherModal && (
            <button
              type="button"
              onClick={onOpenWeatherModal}
              className="hidden lg:flex items-center gap-3 bg-[#5A5A40]/40 hover:bg-[#5A5A40]/60 border border-[#5A5A40]/80 px-3.5 py-1.5 rounded-xl text-xs text-[#F5F5F0] transition-colors cursor-pointer"
              title="Clique para ver ou alterar a localização meteorológica das suas plantas"
            >
              {weatherLocation && currentWeather ? (
                <>
                  <div className="flex items-center gap-1.5 text-[#D4AF37]">
                    <Sun className="w-4 h-4" />
                    <span>{currentWeather.temperature}°C {weatherLocation.name.split(',')[0]}</span>
                  </div>
                  <div className="w-px h-3 bg-[#5A5A40]" />
                  <span className="text-[#F5F5F0]/80 truncate max-w-[150px]">{currentWeather.conditionText}</span>
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-[#D4AF37]">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Definir clima do jardim</span>
                </div>
              )}
            </button>
          )}

          {/* User Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* About / Welcome Guide Button */}
            {onOpenWelcomeModal && (
              <button
                type="button"
                onClick={onOpenWelcomeModal}
                className="p-2 text-[#F5F5F0]/80 hover:text-[#D4AF37] hover:bg-[#5A5A40]/40 rounded-xl transition-colors cursor-pointer"
                title="Sobre o PlantAI & Guia de Boas-vindas"
                aria-label="Sobre o PlantAI"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            )}

            {/* Add New Plant Button */}
            <button
              onClick={onOpenNewPlantModal}
              className="flex items-center gap-1.5 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#2D3A2D] font-bold px-3 sm:px-3.5 py-1.5 rounded-xl text-xs shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Cadastrar Planta</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
