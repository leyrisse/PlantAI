import React, { useState } from 'react';
import { Plant, Environment, PlantCollection, WishListItem, InitialPlantData } from '../types';
import { formatDisplayDate } from '../utils/dateUtils';
import {
  Search,
  Filter,
  LayoutGrid,
  List,
  Sparkles,
  Plus,
  Sun,
  MapPin,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Trash2,
  Flower2,
  X,
  Droplets,
  BookmarkCheck,
  Camera,
  Info,
} from 'lucide-react';
import { SpeciesCareAccordion } from './SpeciesCareAccordion';

interface GardenModuleProps {
  plants: Plant[];
  environments: Environment[];
  collections: PlantCollection[];
  onSelectPlant: (plant: Plant) => void;
  onOpenNewPlantModal: () => void;
  wishList: WishListItem[];
  onRemoveWishListItem: (id: string) => void;
  onAddToGarden: (initialData: InitialPlantData) => void;
  onNavigateToCamera?: () => void;
  onLoadDemoPlants?: () => void;
  currentTemperature?: number | null;
  onDeletePlant?: (plantId: string) => void;
}

export const GardenModule: React.FC<GardenModuleProps> = ({
  plants,
  environments,
  collections,
  onSelectPlant,
  onOpenNewPlantModal,
  wishList,
  onRemoveWishListItem,
  onAddToGarden,
  onNavigateToCamera,
  onLoadDemoPlants,
  currentTemperature,
  onDeletePlant,
}) => {
  // Navigation between Meu Jardim (current plants) and Jardim Futuro (planned plants)
  const [gardenSection, setGardenSection] = useState<'MY_GARDEN' | 'FUTURE_GARDEN'>('MY_GARDEN');

  // Initial screen for Meu Jardim is Jardim Virtual as requested
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST' | 'VIRTUAL'>('VIRTUAL');
  const [selectedEnvId, setSelectedEnvId] = useState<string | 'ALL'>('ALL');
  const [selectedColName, setSelectedColName] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Selected item for details modal in Jardim Futuro
  const [selectedWishListItem, setSelectedWishListItem] = useState<WishListItem | null>(null);

  // Filtered plants for Meu Jardim
  const filteredPlants = plants.filter((plant) => {
    const matchesEnv = selectedEnvId === 'ALL' || plant.environmentId === selectedEnvId;
    const matchesCol = selectedColName === 'ALL' || plant.collectionName === selectedColName;
    const matchesQuery =
      plant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plant.species.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plant.rgDigital.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesEnv && matchesCol && matchesQuery;
  });

  const handleStartGardenRegistration = (item: WishListItem) => {
    onAddToGarden({
      photoUrl: item.photoUrl,
      species: item.popularName
        ? `${item.popularName} (${item.scientificName})`
        : item.scientificName,
      scientificName: item.scientificName,
      popularName: item.popularName,
      name: item.popularName || item.scientificName,
      careGuide: item.careGuide,
    });
    setSelectedWishListItem(null);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* ======================================================== */}
      {/* SECTION 1: MEU JARDIM (Default View with Jardim Virtual) */}
      {/* ======================================================== */}
      {gardenSection === 'MY_GARDEN' && (
        <div className="space-y-6">
          
          {/* Main Title & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#5A5A40]/30 pb-3">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#2D3A2D] flex items-center gap-2">
                Meu Jardim
                <span className="text-xs font-mono font-bold bg-[#5A5A40]/20 text-[#2D3A2D] px-2.5 py-0.5 rounded-full border border-[#5A5A40]/30">
                  {filteredPlants.length} {filteredPlants.length === 1 ? 'planta' : 'plantas'}
                </span>
              </h2>
              <p className="text-[#5A5A40] text-xs mt-0.5">
                Plantas que você possui e acompanha no ecossistema Jardim.
              </p>
            </div>

            {/* View Mode Controls & Add Plant Button */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-[#5A5A40]/15 p-1 rounded-2xl flex items-center gap-1 text-xs font-medium border border-[#5A5A40]/20 shadow-xs">
                <button
                  onClick={() => setViewMode('VIRTUAL')}
                  className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
                    viewMode === 'VIRTUAL' ? 'bg-[#D4AF37] text-[#2D3A2D] shadow-xs font-bold' : 'text-[#2D3A2D] hover:bg-[#5A5A40]/20'
                  }`}
                  title="Jardim Virtual Imersivo"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#2D3A2D]" />
                  Jardim Virtual
                </button>

                <button
                  onClick={() => setViewMode('GRID')}
                  className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
                    viewMode === 'GRID' ? 'bg-[#2D3A2D] text-[#F5F5F0] shadow-xs font-bold' : 'text-[#5A5A40] hover:text-[#2D3A2D]'
                  }`}
                  title="Visualização em Cards"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Cards
                </button>

                <button
                  onClick={() => setViewMode('LIST')}
                  className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
                    viewMode === 'LIST' ? 'bg-[#2D3A2D] text-[#F5F5F0] shadow-xs font-bold' : 'text-[#5A5A40] hover:text-[#2D3A2D]'
                  }`}
                  title="Visualização em Lista"
                >
                  <List className="w-3.5 h-3.5" />
                  Lista
                </button>
              </div>

              <button
                onClick={onOpenNewPlantModal}
                className="flex items-center gap-1.5 bg-[#A68069] hover:bg-[#8e6c57] text-[#F5F5F0] font-bold px-3.5 py-2 rounded-2xl text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                Cadastrar Planta
              </button>
            </div>
          </div>

          {/* PASSAGEM VISUAL CLARA PARA "JARDIM FUTURO" */}
          <div
            onClick={() => setGardenSection('FUTURE_GARDEN')}
            className="bg-gradient-to-r from-[#2D3A2D] via-[#233123] to-[#1a241a] text-[#F5F5F0] rounded-3xl p-4 sm:p-5 border border-[#D4AF37]/40 shadow-lg cursor-pointer hover:border-[#D4AF37] hover:shadow-xl transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#5A5A40]/60 text-[#D4AF37] flex items-center justify-center font-bold border border-[#D4AF37]/30 group-hover:scale-105 transition-transform shrink-0 shadow-sm">
                <BookmarkCheck className="w-6 h-6 text-[#D4AF37]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-lg font-bold text-[#F5F5F0]">
                    Jardim Futuro
                  </h3>
                  <span className="text-[11px] font-mono font-bold bg-[#D4AF37] text-[#2D3A2D] px-2.5 py-0.5 rounded-full shadow-xs">
                    {wishList.length} {wishList.length === 1 ? 'espécie desejada' : 'espécies desejadas'}
                  </span>
                </div>
                <p className="text-xs text-[#F5F5F0]/80 mt-0.5 max-w-xl leading-relaxed">
                  Espécies que você pretende ter futuramente. Toque para visualizar fotos, datas e recomendações botânicas salvas pela Câmera.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setGardenSection('FUTURE_GARDEN');
              }}
              className="self-end sm:self-center px-4 py-2.5 bg-[#D4AF37] hover:bg-[#c29e2f] text-[#2D3A2D] font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <span>Acessar Jardim Futuro</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* FILTER TOGGLE BUTTON */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                isFilterOpen || selectedEnvId !== 'ALL' || selectedColName !== 'ALL' || searchQuery
                  ? 'bg-[#2D3A2D] text-[#F5F5F0] border-[#5A5A40]'
                  : 'bg-white text-[#5A5A40] hover:text-[#2D3A2D] border-[#5A5A40]/25 shadow-2xs'
              }`}
            >
              <Filter className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Filtros do Meu Jardim</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
              {(selectedEnvId !== 'ALL' || selectedColName !== 'ALL' || searchQuery) && (
                <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" title="Filtro Ativo" />
              )}
            </button>

            {/* Quick Search Bar when filters are collapsed */}
            {!isFilterOpen && (
              <div className="relative w-48 sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#5A5A40]" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou espécie..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white pl-8 pr-3 py-1 rounded-xl border border-[#5A5A40]/20 text-xs text-[#2D3A2D] focus:outline-none focus:ring-1 focus:ring-[#A68069]"
                />
              </div>
            )}
          </div>

          {/* EXPANDABLE FILTERS SECTION */}
          {isFilterOpen && (
            <div className="pt-2 border-t border-[#5A5A40]/15 animate-fadeIn space-y-3">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  {/* Environment Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                    <button
                      onClick={() => setSelectedEnvId('ALL')}
                      className={`text-xs px-3 py-1 rounded-xl font-medium transition-colors ${
                        selectedEnvId === 'ALL'
                          ? 'bg-[#2D3A2D] text-[#F5F5F0]'
                          : 'bg-white hover:bg-[#F5F5F0] text-[#5A5A40] border border-[#5A5A40]/20'
                      }`}
                    >
                      Todos Ambientes
                    </button>
                    {environments.map((env) => (
                      <button
                        key={env.id}
                        onClick={() => setSelectedEnvId(env.id)}
                        className={`text-xs px-3 py-1 rounded-xl font-medium transition-colors whitespace-nowrap ${
                          selectedEnvId === env.id
                            ? 'bg-[#2D3A2D] text-[#F5F5F0]'
                            : 'bg-white hover:bg-[#F5F5F0] text-[#5A5A40] border border-[#5A5A40]/20'
                        }`}
                      >
                        {env.name}
                      </button>
                    ))}
                  </div>

                  <div className="hidden sm:block w-px h-4 bg-[#5A5A40]/30" />

                  {/* Collection Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                    <button
                      onClick={() => setSelectedColName('ALL')}
                      className={`text-xs px-3 py-1 rounded-xl font-medium transition-colors ${
                        selectedColName === 'ALL'
                          ? 'bg-[#A68069] text-[#F5F5F0]'
                          : 'bg-white hover:bg-[#F5F5F0] text-[#5A5A40] border border-[#5A5A40]/20'
                      }`}
                    >
                      Todas Coleções
                    </button>
                    {collections.map((col) => (
                      <button
                        key={col.id}
                        onClick={() => setSelectedColName(col.name)}
                        className={`text-xs px-3 py-1 rounded-xl font-medium transition-colors whitespace-nowrap ${
                          selectedColName === col.name
                            ? 'bg-[#A68069] text-[#F5F5F0]'
                            : 'bg-white hover:bg-[#F5F5F0] text-[#5A5A40] border border-[#5A5A40]/20'
                        }`}
                      >
                        {col.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compact Search Bar */}
                <div className="relative min-w-[200px] md:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#5A5A40]" />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou espécie..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white pl-8 pr-3 py-1.5 rounded-xl border border-[#5A5A40]/25 text-xs text-[#2D3A2D] focus:outline-none focus:ring-1 focus:ring-[#A68069]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* EMPTY GARDEN (NEW VISITOR) OR EMPTY FILTER RESULTS */}
          {plants.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-[#5A5A40]/20 shadow-xs space-y-5 max-w-xl mx-auto my-6 animate-fadeIn">
              <div className="w-16 h-16 bg-[#F5F5F0] rounded-3xl flex items-center justify-center mx-auto text-[#D4AF37] border border-[#5A5A40]/15 shadow-xs">
                <Sparkles className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#2D3A2D]">
                  Seu jardim está pronto para começar!
                </h3>
                <p className="text-xs text-[#5A5A40] max-w-md mx-auto leading-relaxed">
                  Você ainda não possui plantas cadastradas. Use a câmera para identificar uma espécie ou cadastre sua primeira planta para iniciar seu histórico de regas e cuidados.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                {onNavigateToCamera && (
                  <button
                    type="button"
                    onClick={onNavigateToCamera}
                    className="w-full sm:w-auto px-5 py-2.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 border border-[#D4AF37]/40 cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-[#D4AF37]" />
                    <span>Identificar com a Câmera</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenNewPlantModal}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#F5F5F0] hover:bg-[#eaeae2] text-[#2D3A2D] text-xs font-bold rounded-xl border border-[#5A5A40]/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#A68069]" />
                  <span>Cadastrar Planta</span>
                </button>
              </div>
              {onLoadDemoPlants && (
                <div className="pt-4 border-t border-[#5A5A40]/15">
                  <button
                    type="button"
                    onClick={onLoadDemoPlants}
                    className="text-[11px] text-[#5A5A40] hover:text-[#2D3A2D] underline font-medium transition-colors cursor-pointer"
                  >
                    Ou clique aqui para carregar plantas de demonstração (Modo Demo)
                  </button>
                </div>
              )}
            </div>
          ) : filteredPlants.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-[#5A5A40]/20 shadow-xs space-y-4">
              <div className="w-12 h-12 bg-[#F5F5F0] rounded-2xl flex items-center justify-center mx-auto text-[#A68069]">
                <Filter className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-serif text-lg font-bold text-[#2D3A2D]">Nenhuma planta encontrada com esses filtros</h4>
                <p className="text-xs text-[#5A5A40] mt-1">
                  Tente alterar os termos de busca, selecionar outro ambiente ou limpar a seleção atual.
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedEnvId('ALL');
                  setSelectedColName('ALL');
                  setSearchQuery('');
                }}
                className="px-4 py-2 bg-[#2D3A2D] text-[#F5F5F0] text-xs font-bold rounded-xl"
              >
                Limpar Filtros
              </button>
            </div>
          ) : null}

          {/* VIEW MODE 1: JARDIM VIRTUAL (DEFAULT) */}
          {viewMode === 'VIRTUAL' && filteredPlants.length > 0 && (
            <div className="bg-gradient-to-b from-[#1b261b] via-[#2D3A2D] to-[#182318] rounded-3xl p-5 sm:p-8 border border-[#5A5A40] shadow-2xl relative overflow-hidden space-y-6">
              
              {/* Sweeping Sunbeams / Rays of Sunlight Atmosphere Layer */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute -top-32 -left-32 w-[160%] h-[180%] sunbeam-slats pointer-events-none opacity-50 animate-sunbeam-slow" />
                <div className="absolute -top-32 -left-20 w-[140%] h-[180%] bg-gradient-to-r from-transparent via-[#D4AF37]/25 to-transparent blur-2xl transform -rotate-35 animate-sunbeam pointer-events-none" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-amber-200/20 via-yellow-400/10 to-transparent rounded-full blur-3xl animate-sunbeam-slow pointer-events-none" />
              </div>

              {/* Virtual Garden Header */}
              <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[#F5F5F0] border-b border-[#5A5A40]/80 pb-4 gap-3">
                <div>
                  <h3 className="font-serif text-2xl font-bold flex items-center gap-2 text-[#F5F5F0]">
                    <Sun className="w-5 h-5 text-[#D4AF37] animate-pulse" />
                    Jardim Virtual Imersivo
                  </h3>
                  <p className="text-xs text-[#F5F5F0]/80 mt-0.5">
                    Plantas cadastradas iluminadas por microclima e incidência solar.
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-[#1b261b]/80 border border-[#D4AF37]/40 px-3 py-1.5 rounded-2xl backdrop-blur-md shadow-md">
                  <Sun className="w-4 h-4 text-[#D4AF37]" />
                  <span className="text-xs font-mono text-[#D4AF37] font-bold">
                    {currentTemperature !== undefined && currentTemperature !== null
                      ? `Luz Solar Ativa • ${currentTemperature}°C`
                      : 'Luz Solar Ativa'}
                  </span>
                </div>
              </div>

              {/* Realistic Botanical Microclimate Shelves */}
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6">
                {environments.map((env) => {
                  const envPlants = filteredPlants.filter((p) => p.environmentId === env.id);

                  return (
                    <div
                      key={env.id}
                      className="bg-[#233123]/80 backdrop-blur-md border border-[#5A5A40]/80 rounded-3xl p-5 relative overflow-hidden space-y-4 shadow-xl group hover:border-[#D4AF37]/60 transition-all"
                    >
                      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#D4AF37]/15 rounded-full blur-xl pointer-events-none" />

                      <div className="flex items-center justify-between text-[#F5F5F0] relative z-10">
                        <span className="font-serif font-bold text-base flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-[#D4AF37]" />
                          {env.name}
                        </span>
                        <span className="text-xs bg-[#182318] px-3 py-1 rounded-full text-[#D4AF37] border border-[#5A5A40] font-mono font-bold shadow-xs">
                          {envPlants.length} espécimes
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 relative z-10">
                        {envPlants.map((plant) => (
                          <div
                            key={plant.id}
                            onClick={() => onSelectPlant(plant)}
                            className="bg-[#182318]/90 p-3 rounded-2xl border border-[#5A5A40]/80 hover:border-[#D4AF37] transition-all cursor-pointer group space-y-2 hover:scale-[1.03] shadow-md hover:shadow-2xl relative overflow-hidden"
                          >
                            <div className="relative h-28 overflow-hidden rounded-xl">
                              <img
                                src={plant.photo}
                                alt={plant.name}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-[#182318] via-transparent to-transparent opacity-60" />
                              <span className="absolute bottom-1.5 left-1.5 bg-[#182318]/90 text-[#D4AF37] text-[10px] font-mono px-2 py-0.5 rounded-md font-bold border border-[#D4AF37]/40 shadow-xs">
                                {plant.rgDigital}
                              </span>
                              {onDeletePlant && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeletePlant(plant.id);
                                  }}
                                  className="absolute top-1.5 right-1.5 p-1 bg-[#182318]/90 hover:bg-red-600 text-stone-300 hover:text-white rounded-md transition-all cursor-pointer opacity-90 sm:opacity-0 group-hover:opacity-100 shadow-xs border border-[#5A5A40]/40"
                                  title={`Excluir ${plant.name}`}
                                  aria-label={`Excluir ${plant.name}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <div>
                              <h5 className="text-xs font-bold text-[#F5F5F0] group-hover:text-[#D4AF37] transition-colors">
                                {plant.name}
                              </h5>
                              <p className="text-[10px] text-[#F5F5F0]/70 italic line-clamp-1 font-serif">{plant.species}</p>
                            </div>
                          </div>
                        ))}

                        {envPlants.length === 0 && (
                          <div className="col-span-2 text-center py-8 text-xs text-[#F5F5F0]/60 border border-dashed border-[#5A5A40]/60 rounded-2xl bg-[#182318]/50">
                            Nenhuma planta neste ambiente.
                          </div>
                        )}
                      </div>

                      <div className="h-2.5 w-full bg-[#A68069]/30 rounded-full border border-[#A68069]/40 mt-2 shadow-inner" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW MODE 2: CARDS GRID */}
          {viewMode === 'GRID' && filteredPlants.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPlants.map((plant) => (
                <div
                  key={plant.id}
                  onClick={() => onSelectPlant(plant)}
                  className="bg-white rounded-3xl border border-[#5A5A40]/20 overflow-hidden shadow-xs hover:border-[#A68069] transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div className="relative aspect-4/3 bg-[#2D3A2D]/10 overflow-hidden">
                    <img
                      src={plant.photo}
                      alt={plant.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className="bg-[#2D3A2D]/90 text-[#D4AF37] text-[11px] font-mono px-2.5 py-1 rounded-full backdrop-blur-xs border border-[#D4AF37]/30 font-bold shadow-xs">
                        {plant.rgDigital}
                      </span>
                    </div>

                    <span className="absolute bottom-3 right-3 bg-white/95 text-[#2D3A2D] text-[11px] font-bold px-3 py-1 rounded-xl backdrop-blur-xs shadow-xs border border-[#5A5A40]/20">
                      {plant.environmentName}
                    </span>
                  </div>

                  <div className="p-5 space-y-4">
                    <div>
                      <h4 className="font-serif text-xl font-bold text-[#2D3A2D] group-hover:text-[#A68069] transition-colors leading-snug">
                        {plant.name}
                      </h4>
                      <p className="font-serif text-xs italic text-[#5A5A40] mt-0.5">
                        {plant.species}
                      </p>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-[#5A5A40]/15 text-xs text-[#5A5A40]">
                      <div className="flex items-center justify-between">
                        <span>Coleção:</span>
                        <strong className="text-[#2D3A2D]">{plant.collectionName || 'Geral'}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Última Rega:</span>
                        <strong className="text-[#2D3A2D]">{formatDisplayDate(plant.careSchedule.lastWatered)}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Última Adubação:</span>
                        <strong className="text-[#2D3A2D]">{formatDisplayDate(plant.careSchedule.lastFertilized)}</strong>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#5A5A40]/15 flex items-center justify-between text-xs">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {plant.tutors.map((tutor) => (
                          <img
                            key={tutor.id}
                            src={tutor.avatar}
                            alt={tutor.name}
                            className="inline-block h-6 w-6 rounded-full ring-2 ring-white"
                            title={tutor.name}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        {onDeletePlant && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeletePlant(plant.id);
                            }}
                            className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title={`Excluir ${plant.name}`}
                            aria-label={`Excluir ${plant.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span className="font-bold text-[#A68069] group-hover:underline">
                          Ver Detalhes →
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VIEW MODE 3: LIST TABLE */}
          {viewMode === 'LIST' && filteredPlants.length > 0 && (
            <div className="bg-white rounded-3xl border border-[#5A5A40]/20 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#2D3A2D]">
                  <thead className="bg-[#2D3A2D] text-[#F5F5F0] font-serif font-bold border-b border-[#5A5A40] uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="p-4">Planta</th>
                      <th className="p-4">Código</th>
                      <th className="p-4">Ambiente</th>
                      <th className="p-4">Coleção</th>
                      <th className="p-4">Última Rega</th>
                      <th className="p-4">Tutores</th>
                      <th className="p-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#5A5A40]/15">
                    {filteredPlants.map((plant) => (
                      <tr
                        key={plant.id}
                        onClick={() => onSelectPlant(plant)}
                        className="hover:bg-[#F5F5F0] transition-colors cursor-pointer"
                      >
                        <td className="p-4 font-semibold text-[#2D3A2D] flex items-center gap-3">
                          <img
                            src={plant.photo}
                            alt={plant.name}
                            className="w-10 h-10 rounded-xl object-cover ring-1 ring-[#5A5A40]/30"
                          />
                          <div>
                            <div className="text-sm font-serif font-bold">{plant.name}</div>
                            <div className="text-[#5A5A40] italic text-[11px]">{plant.species}</div>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-[#A68069] font-bold">{plant.rgDigital}</td>
                        <td className="p-4 font-medium">{plant.environmentName}</td>
                        <td className="p-4 font-medium">{plant.collectionName || '—'}</td>
                        <td className="p-4 font-medium">{formatDisplayDate(plant.careSchedule.lastWatered)}</td>
                        <td className="p-4 font-medium">{plant.tutors.map((t) => t.name).join(', ')}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {onDeletePlant && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeletePlant(plant.id);
                                }}
                                className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title={`Excluir ${plant.name}`}
                                aria-label={`Excluir ${plant.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <span className="font-bold text-[#A68069] group-hover:underline cursor-pointer">
                              Abrir Perfil →
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 2: JARDIM FUTURO (Plantas Desejadas)              */}
      {/* ======================================================== */}
      {gardenSection === 'FUTURE_GARDEN' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Breadcrumb / Return to Meu Jardim button */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setGardenSection('MY_GARDEN')}
              className="flex items-center gap-2 text-xs font-bold text-[#2D3A2D] hover:text-[#182318] bg-white px-3.5 py-2 rounded-xl border border-[#5A5A40]/25 shadow-2xs transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Meu Jardim</span>
            </button>

            {onNavigateToCamera && (
              <button
                type="button"
                onClick={onNavigateToCamera}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#D4AF37] hover:bg-[#c29e2f] text-[#2D3A2D] font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Identificar com Câmera</span>
              </button>
            )}
          </div>

          {/* Jardim Futuro Header Banner */}
          <div className="bg-[#2D3A2D] rounded-3xl p-6 sm:p-8 text-[#F5F5F0] shadow-md border border-[#5A5A40]/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 bg-[#5A5A40] text-[#D4AF37] text-xs px-3 py-1 rounded-full border border-[#D4AF37]/30 font-semibold">
                  <BookmarkCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                  Jardim Futuro
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F5F0]">
                  Plantas que Pretendo Ter
                </h2>
                <p className="text-xs sm:text-sm text-[#F5F5F0]/80 max-w-xl leading-relaxed">
                  Espécies que você pretende ter futuramente. Esta lista é independente do seu jardim pessoal e armazena fotos, datas e guias botânicos para consulta.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold bg-[#5A5A40]/70 text-[#D4AF37] px-3.5 py-2 rounded-xl border border-[#D4AF37]/30">
                  {wishList.length} {wishList.length === 1 ? 'espécie desejada' : 'espécies desejadas'}
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2 text-[11px] text-[#F5F5F0]/70 border-t border-[#5A5A40]/40">
              <Info className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span>
                As plantas adicionadas pela Câmera ficam preservadas aqui até você decidir plantá-las no seu jardim.
              </span>
            </div>
          </div>

          {/* EMPTY STATE FOR JARDIM FUTURO */}
          {wishList.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-[#5A5A40]/20 shadow-xs space-y-4 max-w-xl mx-auto my-6">
              <div className="w-16 h-16 bg-[#F5F5F0] rounded-3xl flex items-center justify-center mx-auto text-[#A68069] border border-[#5A5A40]/15">
                <BookmarkCheck className="w-8 h-8 text-[#A68069]" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-serif text-xl font-bold text-[#2D3A2D]">
                  Seu Jardim Futuro ainda não possui plantas desejadas
                </h3>
                <p className="text-xs text-[#5A5A40] max-w-md mx-auto leading-relaxed">
                  Use a <strong>Câmera</strong> para identificar plantas que encontrar em passeios, floriculturas ou parques. No resultado da identificação, toque no botão <strong>+</strong> e selecione <strong>Adicionar à minha lista</strong> para salvá-las aqui antes de adquiri-las.
                </p>
              </div>

              {onNavigateToCamera && (
                <div className="pt-2">
                  <button
                    onClick={onNavigateToCamera}
                    className="px-5 py-2.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] font-bold text-xs rounded-2xl shadow-sm transition-all active:scale-95 flex items-center gap-2 mx-auto border border-[#5A5A40] cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-[#D4AF37]" />
                    Abrir Câmera & Identificar
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* GRID OF DESIRED PLANTS IN JARDIM FUTURO */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {wishList.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl border border-[#5A5A40]/20 overflow-hidden shadow-xs hover:border-[#A68069] transition-all flex flex-col justify-between group"
                >
                  {/* Photo Area */}
                  <div className="relative aspect-4/3 bg-[#2D3A2D]/10 overflow-hidden">
                    <img
                      src={item.photoUrl}
                      alt={item.scientificName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-3 left-3">
                      <span className="bg-[#2D3A2D]/90 text-[#D4AF37] text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-xs border border-[#D4AF37]/30 shadow-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {item.addedAt}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveWishListItem(item.id);
                      }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 hover:bg-red-50 text-stone-500 hover:text-red-600 flex items-center justify-center transition-colors shadow-sm cursor-pointer"
                      title="Remover da lista"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      {item.popularName ? (
                        <>
                          <h4 className="font-serif text-lg font-bold text-[#2D3A2D] capitalize leading-snug">
                            {item.popularName}
                          </h4>
                          <p className="font-serif text-xs italic text-[#5A5A40]">
                            {item.scientificName}
                          </p>
                        </>
                      ) : (
                        <h4 className="font-serif text-base font-bold text-[#2D3A2D] italic leading-snug">
                          {item.scientificName}
                        </h4>
                      )}

                      {/* Care Guide preview tags */}
                      {item.careGuide && (
                        <div className="grid grid-cols-2 gap-2 pt-2.5 text-[11px] text-[#5A5A40]">
                          <div className="flex items-center gap-1 bg-[#F5F5F0] p-1.5 rounded-lg border border-[#5A5A40]/15">
                            <Droplets className="w-3 h-3 text-sky-600 shrink-0" />
                            <span className="truncate">{item.careGuide.wateringSummary || 'Rega'}</span>
                          </div>
                          <div className="flex items-center gap-1 bg-[#F5F5F0] p-1.5 rounded-lg border border-[#5A5A40]/15">
                            <Sun className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="truncate">{item.careGuide.sunlightSummary || 'Luz'}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="pt-2 border-t border-[#5A5A40]/15 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedWishListItem(item)}
                        className="flex-1 py-2 px-3 bg-[#F5F5F0] hover:bg-[#e8e8df] text-[#2D3A2D] text-xs font-bold rounded-xl transition-colors text-center cursor-pointer"
                      >
                        Ver Detalhes
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartGardenRegistration(item)}
                        className="py-2 px-3 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1 border border-[#5A5A40] cursor-pointer"
                        title="Cadastrar no Meu Jardim"
                      >
                        <Flower2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Plantar</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* DETAILS MODAL FOR PLANT IN JARDIM FUTURO */}
      {selectedWishListItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 border border-[#5A5A40]/30 shadow-2xl space-y-6 my-auto max-h-[92vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#5A5A40]/20 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#2D3A2D] text-[#D4AF37] flex items-center justify-center font-bold">
                  <BookmarkCheck className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-bold text-[#2D3A2D]">
                    {selectedWishListItem.popularName || selectedWishListItem.scientificName}
                  </h3>
                  <p className="text-xs text-[#5A5A40]">
                    Salva no Jardim Futuro em {selectedWishListItem.addedAt}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedWishListItem(null)}
                className="text-[#5A5A40] hover:text-[#2D3A2D] p-1.5 rounded-xl hover:bg-[#F5F5F0] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Photo */}
            <div className="relative aspect-16/9 rounded-2xl overflow-hidden border border-[#5A5A40]/20 shadow-xs">
              <img
                src={selectedWishListItem.photoUrl}
                alt={selectedWishListItem.scientificName}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-serif italic">
                {selectedWishListItem.scientificName}
              </div>
            </div>

            {/* Care Details */}
            {selectedWishListItem.careGuide ? (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-[#2D3A2D] uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  Diretrizes de Cultivo da Espécie
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#F5F5F0] p-3.5 rounded-2xl border border-[#5A5A40]/15 space-y-1">
                    <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-sky-600" />
                      Rega
                    </span>
                    <p className="text-xs font-semibold text-[#2D3A2D]">
                      {selectedWishListItem.careGuide.wateringSummary}
                    </p>
                    <p className="text-[11px] text-[#5A5A40]">
                      {selectedWishListItem.careGuide.wateringFrequencyGuide}
                    </p>
                  </div>

                  <div className="bg-[#F5F5F0] p-3.5 rounded-2xl border border-[#5A5A40]/15 space-y-1">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-amber-600" />
                      Iluminação
                    </span>
                    <p className="text-xs font-semibold text-[#2D3A2D]">
                      {selectedWishListItem.careGuide.sunlightSummary}
                    </p>
                    <p className="text-[11px] text-[#5A5A40]">
                      {selectedWishListItem.careGuide.sunlightGuide}
                    </p>
                  </div>
                </div>

                <SpeciesCareAccordion careGuide={selectedWishListItem.careGuide} defaultOpen={true} />
              </div>
            ) : (
              <div className="p-4 bg-[#F5F5F0] rounded-2xl border border-[#5A5A40]/15 text-xs text-[#5A5A40]">
                As diretrizes botânicas detalhadas serão carregadas quando você cadastrar esta planta no Meu Jardim.
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-4 border-t border-[#5A5A40]/20 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  onRemoveWishListItem(selectedWishListItem.id);
                  setSelectedWishListItem(null);
                }}
                className="text-xs font-bold text-red-600 hover:text-red-800 flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover da Lista
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedWishListItem(null)}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold text-[#5A5A40] hover:bg-[#F5F5F0] transition-colors cursor-pointer"
                >
                  Fechar
                </button>

                <button
                  type="button"
                  onClick={() => handleStartGardenRegistration(selectedWishListItem)}
                  className="px-5 py-2.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] font-bold text-xs rounded-2xl shadow-md transition-colors flex items-center gap-1.5 border border-[#D4AF37]/50 cursor-pointer"
                >
                  <Flower2 className="w-4 h-4 text-[#D4AF37]" />
                  Cadastrar no Meu Jardim
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
