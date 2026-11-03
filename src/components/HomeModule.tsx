import React from 'react';
import { Plant, CareTaskType, WeatherLocation, CurrentWeather } from '../types';
import { calculateNextCareDate } from '../utils/dateUtils';
import { Calendar, Droplet, Sprout, Scissors, History, QrCode, Heart, ArrowRight, Sun, Info, CalendarHeart, MapPin, Compass } from 'lucide-react';

interface HomeModuleProps {
  plants: Plant[];
  onLogCareTask: (plantId: string, taskType: CareTaskType) => void;
  onSelectPlant: (plant: Plant) => void;
  onNavigateToCare: () => void;
  userRole?: 'HOBBYIST' | 'PRO';
  location?: WeatherLocation | null;
  weather?: CurrentWeather | null;
  isLoadingWeather?: boolean;
  onOpenWeatherModal?: () => void;
}

export const HomeModule: React.FC<HomeModuleProps> = ({
  plants,
  onLogCareTask,
  onSelectPlant,
  onNavigateToCare,
  location,
  weather,
  isLoadingWeather = false,
  onOpenWeatherModal,
}) => {
  // Calculate care status for all plants
  const plantCareList = plants.map((plant) => {
    const nextWater = calculateNextCareDate(plant.careSchedule.lastWatered, plant.careSchedule.waterFrequencyDays);
    const nextFertilize = calculateNextCareDate(plant.careSchedule.lastFertilized, plant.careSchedule.fertilizeFrequencyDays);
    const minDays = Math.min(nextWater.daysRemaining, nextFertilize.daysRemaining);
    const isOverdue = nextWater.isOverdue || nextFertilize.isOverdue || minDays <= 0;
    
    return {
      plant,
      nextWater,
      nextFertilize,
      minDays,
      isOverdue,
    };
  });

  // 1. Urgent & Today tasks (Overdue first, then Today)
  const urgentTasks = plantCareList
    .filter((item) => item.minDays <= 0)
    .sort((a, b) => a.minDays - b.minDays);

  // 2. Upcoming tasks (Future days)
  const upcomingTasks = plantCareList
    .filter((item) => item.minDays > 0)
    .sort((a, b) => a.minDays - b.minDays);

  // Filter memories/milestones from history
  const memories = plants.flatMap((plant) =>
    plant.timeline
      .filter((evt) => evt.type === 'MILESTONE' || evt.type === 'BLOOM')
      .map((evt) => ({ ...evt, plantName: plant.name, plantPhoto: plant.photo, plantRg: plant.rgDigital }))
  );

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* Shortened Welcome Banner (Bom dia & Clima) */}
      <div className="bg-[#2D3A2D] rounded-2xl px-4 sm:px-6 py-3.5 text-[#F5F5F0] shadow-md relative overflow-hidden border border-[#5A5A40]/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#F5F5F0]">
            Bom dia, Guardião do Jardim 🌿
          </h2>
          {location && weather ? (
            <button
              type="button"
              onClick={onOpenWeatherModal}
              className="bg-[#5A5A40] hover:bg-[#484833] text-[#D4AF37] text-xs px-3 py-1 rounded-full border border-[#D4AF37]/30 flex items-center gap-1.5 font-semibold transition-all cursor-pointer shadow-xs group"
              title="Clique para ver detalhes do clima ou alterar a localização do jardim"
            >
              <Sun className="w-3.5 h-3.5 text-[#D4AF37] group-hover:rotate-45 transition-transform" />
              <span>
                {weather.temperature}°C {location.name.split(',')[0]} • {weather.conditionText}
              </span>
            </button>
          ) : location && isLoadingWeather ? (
            <button
              type="button"
              onClick={onOpenWeatherModal}
              className="bg-[#5A5A40] text-[#D4AF37] text-xs px-3 py-1 rounded-full border border-[#D4AF37]/30 flex items-center gap-1.5 font-semibold cursor-pointer animate-pulse"
            >
              <Compass className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Carregando clima de {location.name.split(',')[0]}...</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenWeatherModal}
              className="bg-[#5A5A40]/80 hover:bg-[#5A5A40] text-[#F5F5F0] hover:text-[#D4AF37] text-xs px-3 py-1 rounded-full border border-[#D4AF37]/40 flex items-center gap-1.5 font-semibold transition-all cursor-pointer shadow-xs"
              title="Defina a localização onde suas plantas ficam para monitorar a temperatura real"
            >
              <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Definir localização do jardim 📍</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onNavigateToCare}
            className="flex items-center gap-1.5 bg-[#5A5A40]/80 hover:bg-[#5A5A40] text-[#F5F5F0] px-3 py-1.5 rounded-xl border border-[#D4AF37]/30 text-xs font-bold transition-all"
          >
            <CalendarHeart className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Agenda Completa</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Tasks + Nostalgia Memories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols: Tarefas do Dia (Atrasadas primeiro, depois hoje, depois próximas) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* URGENT / TODAY TASKS SECTION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#5A5A40]/30 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-[#A68069] text-[#F5F5F0] flex items-center justify-center font-bold shadow-xs">
                  <Droplet className="w-4 h-4" />
                </div>
                <h3 className="font-serif text-lg font-bold text-[#2D3A2D]">
                  Tarefas Pendentes ({urgentTasks.length})
                </h3>
              </div>
              <span className="text-xs text-[#A68069] font-bold">Atrasadas & Hoje</span>
            </div>

            {urgentTasks.map(({ plant, nextWater, nextFertilize }) => (
              <div
                key={plant.id}
                className={`bg-white rounded-2xl p-4 border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:border-[#A68069] ${
                  nextWater.isOverdue || nextFertilize.isOverdue
                    ? 'border-l-4 border-l-[#A68069] border-[#A68069]/40 bg-[#A68069]/5'
                    : 'border-[#5A5A40]/20'
                }`}
              >
                {/* Plant Info */}
                <div
                  onClick={() => onSelectPlant(plant)}
                  className="flex items-center gap-3.5 cursor-pointer group flex-1"
                >
                  <img
                    src={plant.photo}
                    alt={plant.name}
                    className="w-13 h-13 rounded-2xl object-cover ring-2 ring-[#5A5A40]/20 group-hover:scale-105 transition-transform"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-serif font-bold text-[#2D3A2D] text-base group-hover:text-[#A68069] transition-colors">
                        {plant.name}
                      </h4>
                      <span className="text-[10px] font-mono bg-[#F5F5F0] text-[#5A5A40] px-2 py-0.5 rounded-md border border-[#5A5A40]/20">
                        {plant.rgDigital}
                      </span>
                    </div>
                    <p className="text-xs text-[#5A5A40] italic mb-1">{plant.species}</p>
                    
                    {/* Calculated Next Dates */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#5A5A40]">
                      <span className="flex items-center gap-1 font-medium">
                        <Droplet className="w-3 h-3 text-[#A68069]" />
                        Rega: <strong className={nextWater.isOverdue ? 'text-red-700 font-bold' : 'text-[#2D3A2D]'}>{nextWater.statusText}</strong>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-medium">
                        <Sprout className="w-3 h-3 text-[#5A5A40]" />
                        Adubação: <strong className={nextFertilize.isOverdue ? 'text-red-700 font-bold' : 'text-[#2D3A2D]'}>{nextFertilize.statusText}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-[#5A5A40]/10 flex-wrap">
                  <button
                    onClick={() => onLogCareTask(plant.id, 'WATER')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      nextWater.isOverdue
                        ? 'bg-[#A68069] hover:bg-[#8e6c57] text-[#F5F5F0] shadow-xs'
                        : 'bg-[#5A5A40]/15 hover:bg-[#5A5A40]/25 text-[#2D3A2D] border border-[#5A5A40]/30'
                    }`}
                  >
                    <Droplet className="w-3.5 h-3.5" />
                    Regar
                  </button>

                  <button
                    onClick={() => onLogCareTask(plant.id, 'FERTILIZE')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      nextFertilize.isOverdue
                        ? 'bg-[#5A5A40] hover:bg-[#484833] text-[#F5F5F0] shadow-xs'
                        : 'bg-[#5A5A40]/15 hover:bg-[#5A5A40]/25 text-[#2D3A2D] border border-[#5A5A40]/30'
                    }`}
                  >
                    <Sprout className="w-3.5 h-3.5" />
                    Adubar
                  </button>

                  <button
                    onClick={() => onLogCareTask(plant.id, 'PRUNE')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#5A5A40]/10 hover:bg-[#5A5A40]/20 text-[#2D3A2D] border border-[#5A5A40]/20"
                  >
                    <Scissors className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Podar
                  </button>
                </div>
              </div>
            ))}

            {urgentTasks.length === 0 && (
              <div className="p-4 rounded-2xl bg-white border border-[#5A5A40]/20 text-center text-xs text-[#5A5A40] italic">
                Nenhuma tarefa atrasada para hoje! Todas as plantas estão em dia. 🌿
              </div>
            )}
          </div>

          {/* UPCOMING TASKS SECTION (PRÓXIMAS TAREFAS) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-[#5A5A40]/30 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-[#5A5A40]/30 text-[#2D3A2D] flex items-center justify-center font-bold">
                  <Calendar className="w-4 h-4 text-[#5A5A40]" />
                </div>
                <h3 className="font-serif text-lg font-bold text-[#2D3A2D]">
                  Próximas Tarefas ({upcomingTasks.length})
                </h3>
              </div>
              <span className="text-xs text-[#5A5A40]">Dias futuros</span>
            </div>

            {upcomingTasks.map(({ plant, nextWater, nextFertilize }) => (
              <div
                key={plant.id}
                className="bg-white/80 rounded-2xl p-3.5 border border-[#5A5A40]/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs hover:bg-white transition-all"
              >
                <div
                  onClick={() => onSelectPlant(plant)}
                  className="flex items-center gap-3 cursor-pointer group flex-1"
                >
                  <img
                    src={plant.photo}
                    alt={plant.name}
                    className="w-11 h-11 rounded-xl object-cover ring-1 ring-[#5A5A40]/20"
                  />
                  <div>
                    <h5 className="font-serif font-bold text-[#2D3A2D] text-sm group-hover:text-[#A68069]">
                      {plant.name}
                    </h5>
                    <div className="flex items-center gap-3 text-[11px] text-[#5A5A40] mt-0.5">
                      <span>Rega: <strong>{nextWater.statusText}</strong></span>
                      <span>•</span>
                      <span>Adubo: <strong>{nextFertilize.statusText}</strong></span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onSelectPlant(plant)}
                  className="text-xs text-[#5A5A40] hover:text-[#2D3A2D] font-semibold px-2 py-1 bg-[#F5F5F0] rounded-xl border border-[#5A5A40]/20"
                >
                  Ver Ficha
                </button>
              </div>
            ))}
          </div>

        </div>


        {/* Right Col: Recordações & Histórias Inapagáveis */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b border-[#5A5A40]/30 pb-3">
            <div className="w-8 h-8 rounded-xl bg-[#2D3A2D] text-[#D4AF37] flex items-center justify-center font-bold">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold text-[#2D3A2D]">Recordações do Jardim</h3>
              <p className="text-xs text-[#5A5A40]">Marcos históricos registrados no perfil da planta</p>
            </div>
          </div>

          <div className="space-y-4">
            {memories.map((mem, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-4 border border-[#5A5A40]/20 shadow-xs space-y-3 relative overflow-hidden"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={mem.plantPhoto}
                    alt={mem.plantName}
                    className="w-12 h-12 rounded-xl object-cover ring-2 ring-[#A68069]/30"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-[#A68069] font-bold">
                      <span>{mem.date} • Recordação de Ouro</span>
                    </div>
                    <h4 className="font-serif font-bold text-[#2D3A2D] text-sm mt-0.5">{mem.title}</h4>
                    <p className="text-xs text-[#5A5A40] mt-1 leading-relaxed">{mem.description}</p>
                  </div>
                </div>

                <div className="bg-[#F5F5F0] p-2.5 rounded-xl border border-[#5A5A40]/15 text-[11px] text-[#5A5A40] flex items-center justify-between font-medium">
                  <span>Planta: <strong className="text-[#2D3A2D]">{mem.plantName}</strong></span>
                  <span className="font-mono text-[#A68069] font-bold">{mem.plantRg}</span>
                </div>
              </div>
            ))}

            {memories.length === 0 && (
              <div className="p-4 rounded-2xl bg-white border border-[#5A5A40]/20 text-center text-xs text-[#5A5A40] italic leading-relaxed">
                Nenhuma recordação registrada ainda. Marcos históricos (como florações e podas) cadastrados no perfil das suas plantas aparecerão aqui.
              </div>
            )}

            <div className="bg-[#2D3A2D] rounded-2xl p-5 border border-[#5A5A40] text-xs text-[#F5F5F0] space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#D4AF37]">
                <Info className="w-4 h-4 text-[#D4AF37]" />
                Filosofia da Identidade Permanente
              </div>
              <p className="text-[#F5F5F0]/90 leading-relaxed">
                No Jardim, o histórico e os registros pertencem à planta, e não ao dono. Mesmo se houver doação ou venda, todas as regas, adubações, florações e relatos permanecem preservados para sempre.
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

