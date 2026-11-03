import React, { useState, useEffect } from 'react';
import { Plant, CareTaskType, TimelineEvent, Tutor, SpeciesCareGuide } from '../types';
import { calculateNextCareDate, formatDisplayDate, getLocalTodayDateStr } from '../utils/dateUtils';
import {
  X,
  QrCode,
  History,
  ShieldCheck,
  UserPlus,
  Send,
  Calendar,
  Droplets,
  Sprout,
  Scissors,
  Sun,
  FileText,
  Plus,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  BookOpen,
  Layers,
  Thermometer,
  RefreshCw,
  Info,
  Check,
  Edit3,
  Save,
  Trash2,
} from 'lucide-react';
import { PlantStructuredCare, CareSchedule } from '../types';
import {
  getOrInitializeStructuredCare,
  deriveStructuredCareFromGuide,
  getWateringDays,
  getFertilizerDays,
  WATERING_FREQUENCY_OPTIONS,
  SUNLIGHT_OPTIONS,
  FERTILIZING_FREQUENCY_OPTIONS,
} from '../utils/careUtils';
import { PlantCareFormFields } from './PlantCareFormFields';
import { SpeciesCareAccordion } from './SpeciesCareAccordion';

interface PlantProfileModalProps {
  plant: Plant;
  onClose: () => void;
  onAddTimelineEvent: (plantId: string, event: Omit<TimelineEvent, 'id'>) => void;
  onAddTutor: (plantId: string, tutor: Tutor) => void;
  onTransferOwnership: (plantId: string, newTutorName: string, reason: string) => void;
  onLogCareTask?: (plantId: string, taskType: CareTaskType) => void;
  onUpdatePlantCareGuide?: (plantId: string, careGuide: SpeciesCareGuide) => void;
  onUpdatePlantCare?: (
    plantId: string,
    structuredCare: PlantStructuredCare,
    careSchedule: CareSchedule,
    careGuide?: SpeciesCareGuide
  ) => void;
  onDeletePlant?: (plantId: string) => void;
}

export const PlantProfileModal: React.FC<PlantProfileModalProps> = ({
  plant,
  onClose,
  onAddTimelineEvent,
  onAddTutor,
  onTransferOwnership,
  onLogCareTask,
  onUpdatePlantCareGuide,
  onUpdatePlantCare,
  onDeletePlant,
}) => {
  const [activeTab, setActiveTab] = useState<'TIMELINE' | 'CARE_GUIDE' | 'TUTORS' | 'TRANSFER'>('CARE_GUIDE');
  const [currentCareGuide, setCurrentCareGuide] = useState<SpeciesCareGuide | undefined>(plant.careGuide);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);

  // Structured Care and Edit mode state
  const [structuredCare, setStructuredCare] = useState<PlantStructuredCare>(() => getOrInitializeStructuredCare(plant));
  const [isEditingCare, setIsEditingCare] = useState(false);
  const [careForm, setCareForm] = useState<PlantStructuredCare>(() => getOrInitializeStructuredCare(plant));
  const [hasManualCareEdits, setHasManualCareEdits] = useState(false);
  const [pendingGuide, setPendingGuide] = useState<SpeciesCareGuide | null>(null);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  useEffect(() => {
    setCurrentCareGuide(plant.careGuide);
    const initial = getOrInitializeStructuredCare(plant);
    setStructuredCare(initial);
    setCareForm(initial);
    setHasManualCareEdits(false);
  }, [plant]);

  const applyGuideToCare = (guide: SpeciesCareGuide) => {
    const derived = deriveStructuredCareFromGuide(guide);
    setCareForm(derived);
    setStructuredCare(derived);
    setHasManualCareEdits(false);
    setShowOverwriteModal(false);
    setPendingGuide(null);

    // If not actively editing, sync immediately with parent
    if (!isEditingCare && onUpdatePlantCare) {
      const wDays = getWateringDays(derived.wateringFrequency, derived.customWateringDays);
      const fDays = getFertilizerDays(derived.fertilizerFrequency, derived.customFertilizerDays);
      const updatedSchedule: CareSchedule = {
        ...plant.careSchedule,
        waterFrequencyDays: wDays,
        fertilizeFrequencyDays: fDays,
      };
      onUpdatePlantCare(plant.id, derived, updatedSchedule, guide);
    }
  };

  const handleKeepManualEdits = () => {
    setShowOverwriteModal(false);
    setPendingGuide(null);
  };

  const handleFetchCareGuide = async () => {
    setIsGeneratingGuide(true);
    setGuideError(null);
    try {
      const response = await fetch('/api/species-care-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scientificName: plant.species,
          commonName: plant.name,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar as orientações botânicas.');
      }

      const guide = data.data as SpeciesCareGuide;
      setCurrentCareGuide(guide);
      if (onUpdatePlantCareGuide) {
        onUpdatePlantCareGuide(plant.id, guide);
      }

      // If user has edited fields, do not overwrite silently! Ask first.
      if (hasManualCareEdits) {
        setPendingGuide(guide);
        setShowOverwriteModal(true);
      } else {
        applyGuideToCare(guide);
      }
    } catch (err: any) {
      setGuideError(err.message || 'Erro ao consultar orientações botânicas.');
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const handleSaveCareEdits = () => {
    const wDays = getWateringDays(careForm.wateringFrequency, careForm.customWateringDays);
    const fDays = getFertilizerDays(careForm.fertilizerFrequency, careForm.customFertilizerDays);
    const updatedSchedule: CareSchedule = {
      ...plant.careSchedule,
      waterFrequencyDays: wDays,
      fertilizeFrequencyDays: fDays,
    };

    setStructuredCare(careForm);
    setIsEditingCare(false);
    setHasManualCareEdits(false);

    if (onUpdatePlantCare) {
      onUpdatePlantCare(plant.id, careForm, updatedSchedule, currentCareGuide);
    }

    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 3500);
  };

  const handleCancelCareEdits = () => {
    setCareForm(structuredCare);
    setIsEditingCare(false);
    setHasManualCareEdits(false);
    setShowOverwriteModal(false);
    setPendingGuide(null);
  };

  // New timeline event form state
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventType, setEventType] = useState<CareTaskType | 'BLOOM' | 'TRANSFER' | 'ADOPTION' | 'MILESTONE'>('NOTE');

  // New tutor state
  const [newTutorName, setNewTutorName] = useState('');
  const [newTutorRole, setNewTutorRole] = useState<'Guardião de Fim de Semana' | 'Consultor Agrônomo' | 'Co-tutor'>('Guardião de Fim de Semana');

  // Transfer state
  const [transferTutorName, setTransferTutorName] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferSuccess, setTransferSuccess] = useState(false);

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    onAddTimelineEvent(plant.id, {
      date: getLocalTodayDateStr(),
      type: eventType,
      title: eventTitle,
      description: eventDesc,
      authorName: plant.tutors[0]?.name || 'Tutor Ativo',
      authorRole: plant.tutors[0]?.role || 'Tutor',
    });

    setEventTitle('');
    setEventDesc('');
  };

  const handleCreateTutor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTutorName.trim()) return;

    onAddTutor(plant.id, {
      id: `tutor-${Date.now()}`,
      name: newTutorName,
      role: newTutorRole,
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80`,
      joinedDate: getLocalTodayDateStr(),
    });

    setNewTutorName('');
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTutorName.trim()) return;

    onTransferOwnership(plant.id, transferTutorName, transferReason);
    setTransferSuccess(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-stone-200 space-y-0 my-auto">
        
        {/* Cover Header */}
        <div className="relative h-56 sm:h-64 bg-[#2D3A2D] text-[#F5F5F0] overflow-hidden rounded-t-3xl">
          <img
            src={plant.photo}
            alt={plant.name}
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#2D3A2D] via-[#2D3A2D]/40 to-transparent" />

          {/* Top action buttons: Delete and Close */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {onDeletePlant && (
              <button
                type="button"
                onClick={() => onDeletePlant(plant.id)}
                className="bg-red-950/70 hover:bg-red-900 text-red-200 hover:text-white px-3 py-1.5 rounded-full border border-red-500/40 transition-colors flex items-center gap-1.5 text-xs font-bold backdrop-blur-xs cursor-pointer shadow-xs"
                title="Excluir planta do jardim"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">Excluir</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-[#2D3A2D]/80 hover:bg-[#2D3A2D] text-[#F5F5F0] p-2 rounded-full border border-[#5A5A40] transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Plant Identity Title Overlay */}
          <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-[#D4AF37] text-[#2D3A2D] font-bold text-xs px-3 py-1 rounded-full shadow-xs">
                  {plant.environmentName || 'Meu Jardim'}
                </span>
                {plant.isOrphan && (
                  <span className="bg-[#A68069] text-[#F5F5F0] font-bold text-xs px-2.5 py-0.5 rounded-full border border-[#D4AF37]/40">
                    Planta Órfã
                  </span>
                )}
              </div>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#F5F5F0]">{plant.name}</h2>
              <p className="text-[#D4AF37] italic text-sm font-serif">{plant.species}</p>
            </div>

            <div className="flex flex-col sm:items-end gap-2">
              <div className="flex items-center gap-2 text-xs bg-[#2D3A2D]/90 p-2.5 rounded-2xl border border-[#5A5A40] text-[#F5F5F0]">
                <Sun className="w-4 h-4 text-[#D4AF37]" />
                <span className="font-medium">{plant.sunlightNeeds}</span>
                <span>•</span>
                <Droplets className="w-4 h-4 text-[#A68069]" />
                <span className="font-medium">{plant.waterNeeds}</span>
              </div>

              {/* Direct Care Action Buttons */}
              {onLogCareTask && (
                <div className="flex items-center gap-1.5 bg-[#1f291f]/90 p-1.5 rounded-2xl border border-[#D4AF37]/40 backdrop-blur-xs">
                  <button
                    onClick={() => onLogCareTask(plant.id, 'WATER')}
                    className="px-2.5 py-1 bg-[#A68069] hover:bg-[#8e6c57] text-[#F5F5F0] rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all"
                  >
                    <Droplets className="w-3 h-3 text-[#D4AF37]" />
                    Regar
                  </button>
                  <button
                    onClick={() => onLogCareTask(plant.id, 'FERTILIZE')}
                    className="px-2.5 py-1 bg-[#5A5A40] hover:bg-[#484833] text-[#F5F5F0] rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all"
                  >
                    <Sprout className="w-3 h-3 text-[#D4AF37]" />
                    Adubar
                  </button>
                  <button
                    onClick={() => onLogCareTask(plant.id, 'PRUNE')}
                    className="px-2.5 py-1 bg-[#2D3A2D] hover:bg-[#182318] text-[#F5F5F0] rounded-xl text-[11px] font-bold flex items-center gap-1 border border-[#5A5A40] shadow-2xs transition-all"
                  >
                    <Scissors className="w-3 h-3 text-[#D4AF37]" />
                    Podar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="border-b border-[#5A5A40]/20 bg-[#F5F5F0] px-6 pt-3 flex items-center space-x-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('CARE_GUIDE')}
            className={`px-4 py-3 font-semibold text-xs rounded-t-2xl transition-all flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeTab === 'CARE_GUIDE'
                ? 'bg-white border-[#A68069] text-[#2D3A2D] shadow-xs font-bold'
                : 'border-transparent text-[#5A5A40] hover:text-[#2D3A2D]'
            }`}
          >
            <BookOpen className="w-4 h-4 text-emerald-700" />
            Guia de Cultivo da Espécie
            {currentCareGuide && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('TIMELINE')}
            className={`px-4 py-3 font-semibold text-xs rounded-t-2xl transition-all flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeTab === 'TIMELINE'
                ? 'bg-white border-[#A68069] text-[#2D3A2D] shadow-xs font-bold'
                : 'border-transparent text-[#5A5A40] hover:text-[#2D3A2D]'
            }`}
          >
            <History className="w-4 h-4 text-[#A68069]" />
            Linha do Tempo Inapagável ({plant.timeline.length})
          </button>

          <button
            onClick={() => setActiveTab('TUTORS')}
            className={`px-4 py-3 font-semibold text-xs rounded-t-2xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'TUTORS'
                ? 'bg-white border-[#A68069] text-[#2D3A2D] shadow-xs font-bold'
                : 'border-transparent text-[#5A5A40] hover:text-[#2D3A2D]'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-[#5A5A40]" />
            Tutores & Guardiões ({plant.tutors.length})
          </button>

          <button
            onClick={() => setActiveTab('TRANSFER')}
            className={`px-4 py-3 font-semibold text-xs rounded-t-2xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'TRANSFER'
                ? 'bg-white border-[#A68069] text-[#2D3A2D] shadow-xs font-bold'
                : 'border-transparent text-[#5A5A40] hover:text-[#2D3A2D]'
            }`}
          >
            <Send className="w-4 h-4 text-[#A68069]" />
            Transferir Custódia / Vender
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 sm:p-8 space-y-6">

          {/* TAB: CARE GUIDE */}
          {activeTab === 'CARE_GUIDE' && (
            <div className="space-y-6 animate-fadeIn">
              {guideError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-xs text-red-800">
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Não foi possível carregar as orientações</p>
                    <p className="text-[11px] text-red-700 mt-0.5">{guideError}</p>
                  </div>
                  <button
                    onClick={handleFetchCareGuide}
                    className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl font-bold text-xs"
                  >
                    Tentar Novamente
                  </button>
                </div>
              )}

              {/* Success Notification on save */}
              {saveSuccessNotice && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-900 shadow-2xs animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="font-semibold">
                    Cuidados estruturados atualizados com sucesso e sincronizados na planta!
                  </span>
                </div>
              )}

              {/* Overwrite Confirmation Alert */}
              {showOverwriteModal && pendingGuide && (
                <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm space-y-3 animate-fadeIn">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-amber-950">
                        Substituir alterações manuais de cuidados?
                      </h5>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        Você já havia personalizado os campos de cuidados desta planta. Foram obtidas novas recomendações botânicas para <strong>{pendingGuide.scientificName}</strong>. Deseja aplicar as novas recomendações aos campos estruturados ou manter suas alterações manuais?
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 justify-end">
                    <button
                      type="button"
                      onClick={handleKeepManualEdits}
                      className="px-3.5 py-1.5 bg-white hover:bg-stone-100 text-[#2D3A2D] text-xs font-semibold rounded-xl border border-stone-300 transition-colors cursor-pointer"
                    >
                      Manter minhas alterações
                    </button>
                    <button
                      type="button"
                      onClick={() => applyGuideToCare(pendingGuide)}
                      className="px-4 py-1.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
                      Substituir pelos recomendados
                    </button>
                  </div>
                </div>
              )}

              {/* Botanical Header Card */}
              <div className="bg-[#2D3A2D] text-[#F5F5F0] rounded-3xl p-5 sm:p-6 border border-[#5A5A40] shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-[#D4AF37] text-[#2D3A2D] text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                      Espécie Botânica
                    </span>
                    {currentCareGuide?.family && (
                      <span className="text-[11px] text-[#F5F5F0]/80 bg-[#1f291f] px-2.5 py-0.5 rounded-full border border-[#5A5A40]">
                        Família: {currentCareGuide.family}
                      </span>
                    )}
                    <span className="text-[11px] text-emerald-300 flex items-center gap-1 font-semibold">
                      <Check className="w-3.5 h-3.5" />
                      {currentCareGuide?.isWellKnownSpecies ? 'Diretrizes Consolidadas' : 'Recomendações Botânicas'}
                    </span>
                  </div>

                  <h3 className="font-serif text-xl sm:text-2xl font-bold italic text-[#F5F5F0]">
                    {currentCareGuide?.scientificName || plant.species}
                  </h3>
                  {(currentCareGuide?.commonName || plant.name) && (
                    <p className="text-xs text-[#D4AF37] font-sans">
                      Nome popular / apelido: <span className="font-semibold">{currentCareGuide?.commonName || plant.name}</span>
                    </p>
                  )}
                </div>

                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  {!isEditingCare ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setCareForm(structuredCare);
                          setIsEditingCare(true);
                          setHasManualCareEdits(false);
                        }}
                        className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#c29e2f] text-[#2D3A2D] font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Editar Cuidados
                      </button>

                      <button
                        type="button"
                        onClick={handleFetchCareGuide}
                        disabled={isGeneratingGuide}
                        className="px-3.5 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingGuide ? 'animate-spin text-[#D4AF37]' : ''}`} />
                        {isGeneratingGuide ? 'Consultando...' : 'Atualizar com IA'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveCareEdits}
                        className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c29e2f] text-[#2D3A2D] font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Salvar Cuidados
                      </button>

                      <button
                        type="button"
                        onClick={handleCancelCareEdits}
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold border border-white/20 transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* CONTENT: Either Edit Form OR Structured Cards View */}
              {isEditingCare ? (
                /* EDIT MODE */
                <div className="space-y-5 bg-white p-5 sm:p-6 rounded-3xl border border-[#5A5A40]/25 shadow-xs">
                  <div className="flex items-center justify-between border-b border-[#5A5A40]/15 pb-2">
                    <div>
                      <h4 className="text-sm font-bold text-[#2D3A2D]">
                        Modo de Edição dos Cuidados
                      </h4>
                      <p className="text-xs text-[#5A5A40]">
                        Personalize os parâmetros de cultivo para a {plant.name}
                      </p>
                    </div>

                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      Editando
                    </span>
                  </div>

                  <PlantCareFormFields
                    care={careForm}
                    onChange={(updatedCare) => {
                      setCareForm(updatedCare);
                      setHasManualCareEdits(true);
                    }}
                  />

                  <div className="pt-3 border-t border-[#5A5A40]/15 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={handleCancelCareEdits}
                      className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCareEdits}
                      className="px-5 py-2 bg-[#2D3A2D] hover:bg-[#1f291f] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5 text-[#D4AF37]" />
                      Salvar Cuidados
                    </button>
                  </div>

                  {/* Collapsible reference accordion during editing */}
                  {currentCareGuide && (
                    <div className="pt-2">
                      <SpeciesCareAccordion careGuide={currentCareGuide} defaultOpen={false} />
                    </div>
                  )}
                </div>
              ) : (
                /* VIEW MODE: Structured Care Cards */
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 1. Rega */}
                    <div className="bg-white p-5 rounded-3xl border border-sky-200/80 shadow-2xs space-y-2.5">
                      <div className="flex items-center justify-between text-sky-800">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                            <Droplets className="w-4 h-4 text-sky-700" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs uppercase tracking-wider text-[#2D3A2D]">
                              Rega e Irrigação
                            </h4>
                            <span className="text-[11px] font-semibold text-sky-700">
                              {structuredCare.wateringFrequency === 'personalizada'
                                ? `Personalizada (${structuredCare.customWateringDays || 7} dias)`
                                : WATERING_FREQUENCY_OPTIONS.find((opt) => opt.id === structuredCare.wateringFrequency)?.label || structuredCare.wateringFrequency}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-sky-900 bg-sky-50/80 px-3 py-1.5 rounded-xl border border-sky-200/60 font-medium">
                        <span>Última rega: <strong>{formatDisplayDate(plant.careSchedule?.lastWatered)}</strong></span>
                        <span>Próxima: <strong>{calculateNextCareDate(plant.careSchedule?.lastWatered, plant.careSchedule?.waterFrequencyDays).statusText}</strong></span>
                      </div>

                      <div className="p-3 bg-sky-50/70 rounded-2xl border border-sky-100 space-y-1 text-xs">
                        <span className="text-[11px] font-bold text-sky-900 block">
                          Como verificar a umidade do solo:
                        </span>
                        <p className="text-sky-950 leading-relaxed font-medium">
                          {structuredCare.soilMoistureCheck || 'Não informado'}
                        </p>
                      </div>
                    </div>

                    {/* 2. Iluminação */}
                    <div className="bg-white p-5 rounded-3xl border border-amber-200/80 shadow-2xs space-y-2.5">
                      <div className="flex items-center gap-2 text-amber-800">
                        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                          <Sun className="w-4 h-4 text-amber-700" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-[#2D3A2D]">
                            Iluminação e Sol
                          </h4>
                          <span className="text-[11px] font-semibold text-amber-700">
                            {structuredCare.sunlightType === 'personalizada' && structuredCare.customSunlight
                              ? `Personalizada: ${structuredCare.customSunlight}`
                              : SUNLIGHT_OPTIONS.find((opt) => opt.id === structuredCare.sunlightType)?.label || structuredCare.sunlightType}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-100 text-xs">
                        <p className="text-amber-950 font-medium">
                          {currentCareGuide?.lighting?.idealLocation ? `Local sugerido: ${currentCareGuide.lighting.idealLocation}` : 'Luminosidade ajustada de acordo com as preferências da espécie.'}
                        </p>
                      </div>
                    </div>

                    {/* 3. Adubação */}
                    <div className="bg-white p-5 rounded-3xl border border-emerald-200/80 shadow-2xs space-y-2.5">
                      <div className="flex items-center gap-2 text-emerald-800">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                          <Sprout className="w-4 h-4 text-emerald-700" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-[#2D3A2D]">
                            Adubação e Nutrientes
                          </h4>
                          <span className="text-[11px] font-semibold text-emerald-700">
                            {structuredCare.fertilizerFrequency === 'personalizada'
                              ? `Personalizada (${structuredCare.customFertilizerDays || 30} dias)`
                              : FERTILIZING_FREQUENCY_OPTIONS.find((opt) => opt.id === structuredCare.fertilizerFrequency)?.label || structuredCare.fertilizerFrequency}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-emerald-900 bg-emerald-50/80 px-3 py-1.5 rounded-xl border border-emerald-200/60 font-medium">
                        <span>Última adubação: <strong>{formatDisplayDate(plant.careSchedule?.lastFertilized)}</strong></span>
                        <span>Próxima: <strong>{calculateNextCareDate(plant.careSchedule?.lastFertilized, plant.careSchedule?.fertilizeFrequencyDays).statusText}</strong></span>
                      </div>

                      <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-100 text-xs space-y-1">
                        <span className="text-[11px] font-bold text-emerald-950 block">Tipo recomendado:</span>
                        <p className="text-emerald-900 font-medium">
                          {structuredCare.fertilizerType || 'Não informado'}
                        </p>
                      </div>
                    </div>

                    {/* 4. Substrato */}
                    <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-2.5">
                      <div className="flex items-center gap-2 text-stone-800">
                        <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
                          <Layers className="w-4 h-4 text-stone-700" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-[#2D3A2D]">
                            Substrato e Drenagem
                          </h4>
                          <span className="text-[11px] font-semibold text-stone-600">Composição ideal</span>
                        </div>
                      </div>

                      <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/70 text-xs space-y-1">
                        <span className="text-[11px] font-bold text-stone-900 block">Recomendação:</span>
                        <p className="text-stone-800 font-medium leading-relaxed">
                          {structuredCare.substrate || 'Não informado'}
                        </p>
                      </div>
                    </div>

                    {/* 5. Temperatura e Umidade */}
                    <div className="bg-white p-5 rounded-3xl border border-teal-200/80 shadow-2xs space-y-2.5">
                      <div className="flex items-center gap-2 text-teal-800">
                        <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
                          <Thermometer className="w-4 h-4 text-teal-700" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-[#2D3A2D]">
                            Temperatura e Umidade
                          </h4>
                          <span className="text-[11px] font-semibold text-teal-600">Condições ambientais</span>
                        </div>
                      </div>

                      <div className="p-3 bg-teal-50/70 rounded-2xl border border-teal-100 text-xs space-y-1">
                        <p className="text-teal-950">
                          <strong>Temperatura:</strong> {structuredCare.temperature || 'Não informado'}
                        </p>
                        <p className="text-teal-950">
                          <strong>Umidade do ar:</strong> {structuredCare.humidity || 'Não informado'}
                        </p>
                      </div>
                    </div>

                    {/* 6. Manutenção */}
                    <div className="bg-white p-5 rounded-3xl border border-rose-200/80 shadow-2xs space-y-2.5">
                      <div className="flex items-center gap-2 text-rose-800">
                        <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                          <Scissors className="w-4 h-4 text-rose-700" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-[#2D3A2D]">
                            Manutenção e Poda
                          </h4>
                          <span className="text-[11px] font-semibold text-rose-600">Manejo contínuo</span>
                        </div>
                      </div>

                      <div className="p-3 bg-rose-50/70 rounded-2xl border border-rose-100 text-xs space-y-1">
                        <span className="text-[11px] font-bold text-rose-950 block">Orientações de poda e replantio:</span>
                        <p className="text-rose-900 font-medium leading-relaxed">
                          {structuredCare.maintenanceNotes || 'Não informado'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Accordion: Diretrizes da espécie (collapsed by default) */}
                  {currentCareGuide ? (
                    <SpeciesCareAccordion careGuide={currentCareGuide} defaultOpen={false} />
                  ) : (
                    <div className="bg-[#FAF8F5] p-6 rounded-3xl border border-[#5A5A40]/20 text-center space-y-3">
                      <BookOpen className="w-8 h-8 text-[#5A5A40] mx-auto opacity-60" />
                      <div>
                        <h5 className="font-serif font-bold text-[#2D3A2D] text-sm">
                          Deseja consultar diretrizes botânicas completas com IA?
                        </h5>
                        <p className="text-xs text-[#5A5A40] max-w-md mx-auto mt-0.5">
                          Gere uma análise botânica abrangente para consultar sempre que precisar nesta aba.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleFetchCareGuide}
                        disabled={isGeneratingGuide}
                        className="px-5 py-2.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-white text-xs font-bold rounded-2xl shadow-xs transition-colors inline-flex items-center gap-2 border border-[#D4AF37]/50 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                        {isGeneratingGuide ? 'Consultando Botânico de IA...' : 'Gerar Diretrizes da Espécie com IA'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 1: TIMELINE */}
          {activeTab === 'TIMELINE' && (
            <div className="space-y-6">
              
              {/* Add event form */}
              <form onSubmit={handleCreateEvent} className="bg-[#F5F5F0] p-5 rounded-3xl border border-[#5A5A40]/20 space-y-3">
                <span className="text-xs font-bold text-[#2D3A2D] uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[#A68069]" />
                  Registrar Novo Marco na Linha do Tempo Permanente
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Título do evento (ex: Nova folha fenestrada)"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className="sm:col-span-2 bg-white border border-[#5A5A40]/30 rounded-2xl px-3.5 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069] font-medium"
                    required
                  />

                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as any)}
                    className="bg-white border border-[#5A5A40]/30 rounded-2xl px-3 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069] font-semibold"
                  >
                    <option value="NOTE">Nota de Cultivo</option>
                    <option value="BLOOM">Floração / Flor</option>
                    <option value="PRUNE">Poda de Manutenção</option>
                    <option value="REPOT">Troca de Vaso / Substrato</option>
                    <option value="WATER">Rega Especial</option>
                    <option value="FERTILIZE">Adubação Nutritiva</option>
                    <option value="MILESTONE">Marco de Aniversário</option>
                  </select>
                </div>

                <textarea
                  rows={2}
                  placeholder="Detalhes (substrato utilizado, tamanho do vaso, observações do tutor)..."
                  value={eventDesc}
                  onChange={(e) => setEventDesc(e.target.value)}
                  className="w-full bg-white border border-[#5A5A40]/30 rounded-2xl p-3 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069]"
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] font-bold px-4 py-2.5 rounded-2xl text-xs shadow-xs transition-colors border border-[#5A5A40]"
                  >
                    Salvar na História Inapagável
                  </button>
                </div>
              </form>

              {/* Timeline Items List */}
              <div className="relative pl-6 border-l-2 border-[#5A5A40] space-y-6">
                {plant.timeline.map((evt) => (
                  <div key={evt.id} className="relative space-y-2 group">
                    {/* Bullet */}
                    <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-[#2D3A2D] ring-4 ring-[#F5F5F0] flex items-center justify-center text-[#D4AF37]" />

                    <div className="bg-white p-5 rounded-3xl border border-[#5A5A40]/20 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between text-xs text-[#5A5A40]">
                        <span className="font-bold text-[#A68069]">{evt.date}</span>
                        <span className="font-bold text-[#2D3A2D] bg-[#F5F5F0] px-2.5 py-0.5 rounded-md border border-[#5A5A40]/15">
                          Por: {evt.authorName}
                        </span>
                      </div>

                      <h4 className="font-serif font-bold text-[#2D3A2D] text-base">{evt.title}</h4>
                      <p className="text-xs text-[#2D3A2D] leading-relaxed">{evt.description}</p>

                      {evt.photoUrl && (
                        <img
                          src={evt.photoUrl}
                          alt={evt.title}
                          className="w-full h-44 object-cover rounded-2xl mt-2 ring-1 ring-[#5A5A40]/20"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* TAB 3: TUTORS & GUARDIANS */}
          {activeTab === 'TUTORS' && (
            <div className="space-y-6">
              
              <div className="flex items-center justify-between border-b border-[#5A5A40]/20 pb-3">
                <div>
                  <h3 className="font-serif text-xl font-bold text-[#2D3A2D]">Tutores e Guardiões Compartilhados</h3>
                  <p className="text-xs text-[#5A5A40]">Várias pessoas podem cuidar da planta juntas e receber lembretes</p>
                </div>
              </div>

              {/* Tutors list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {plant.tutors.map((tut) => (
                  <div key={tut.id} className="bg-white p-4 rounded-2xl border border-[#5A5A40]/20 flex items-center gap-3.5 shadow-2xs">
                    <img
                      src={tut.avatar}
                      alt={tut.name}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-[#5A5A40]/40"
                    />
                    <div>
                      <h4 className="font-serif font-bold text-[#2D3A2D] text-base">{tut.name}</h4>
                      <span className="text-xs font-bold bg-[#F5F5F0] text-[#A68069] px-2.5 py-0.5 rounded-md border border-[#5A5A40]/15">
                        {tut.role}
                      </span>
                      <p className="text-[11px] text-[#5A5A40] mt-1">Desde {tut.joinedDate}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Tutor form */}
              <form onSubmit={handleCreateTutor} className="bg-[#F5F5F0] p-5 rounded-3xl border border-[#5A5A40]/20 space-y-3">
                <span className="text-xs font-bold text-[#2D3A2D] uppercase tracking-wider flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-[#A68069]" />
                  Adicionar Novo Tutor ou Guardião
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Nome do Co-tutor ou Guardião"
                    value={newTutorName}
                    onChange={(e) => setNewTutorName(e.target.value)}
                    className="bg-white border border-[#5A5A40]/30 rounded-2xl px-3.5 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069] font-medium"
                    required
                  />

                  <select
                    value={newTutorRole}
                    onChange={(e) => setNewTutorRole(e.target.value as any)}
                    className="bg-white border border-[#5A5A40]/30 rounded-2xl px-3.5 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069] font-semibold"
                  >
                    <option value="Guardião de Fim de Semana">Guardião de Fim de Semana</option>
                    <option value="Co-tutor">Co-tutor Compartilhado</option>
                    <option value="Consultor Agrônomo">Consultor Agrônomo Técnico</option>
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] font-bold px-4 py-2.5 rounded-2xl text-xs shadow-xs transition-colors border border-[#5A5A40]"
                  >
                    Vincular Novo Tutor
                  </button>
                </div>
              </form>

            </div>
          )}

          {/* TAB 4: TRANSFER CUSTODY */}
          {activeTab === 'TRANSFER' && (
            <div className="space-y-6">
              <div className="bg-[#F5F5F0] p-5 rounded-3xl border border-[#A68069]/40 text-[#2D3A2D] text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-[#A68069]">
                  <AlertCircle className="w-4 h-4 text-[#A68069]" />
                  Transferência Definitiva de Tutoria
                </div>
                <p className="leading-relaxed">
                  Ao doar, vender ou disponibilizar para adoção, você transfere a propriedade ativa do perfil. <strong>O histórico acumulado e as fotos registradas não serão apagados</strong> — o novo tutor dará continuidade à história.
                </p>
              </div>

              {!transferSuccess ? (
                <form onSubmit={handleExecuteTransfer} className="bg-white p-6 rounded-3xl border border-[#5A5A40]/20 shadow-xs space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#2D3A2D] uppercase tracking-wider mb-1.5">
                      Nome do Novo Tutor / Comprador / Adotante <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Mateus Oliveira"
                      value={transferTutorName}
                      onChange={(e) => setTransferTutorName(e.target.value)}
                      className="w-full bg-[#F5F5F0] border border-[#5A5A40]/30 rounded-2xl px-3.5 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069] font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#2D3A2D] uppercase tracking-wider mb-1.5">
                      Motivo / Contexto da Transferência
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Venda via Marketplace do Jardim / Mudança de Cidade"
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      className="w-full bg-[#F5F5F0] border border-[#5A5A40]/30 rounded-2xl px-3.5 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] font-bold text-xs rounded-2xl shadow-xs transition-colors flex items-center justify-center gap-2 border border-[#5A5A40]"
                  >
                    <Send className="w-4 h-4 text-[#D4AF37]" />
                    Confirmar Transferência de Custódia & Manter História
                  </button>
                </form>
              ) : (
                <div className="bg-[#2D3A2D] border border-[#5A5A40] p-6 sm:p-8 rounded-3xl text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-[#D4AF37] mx-auto" />
                  <h4 className="font-serif text-xl font-bold text-[#F5F5F0]">
                    Transferência Concluída com Sucesso!
                  </h4>
                  <p className="text-xs text-[#F5F5F0]/90 max-w-md mx-auto leading-relaxed">
                    A custódia principal da {plant.name} foi atribuída a <strong className="text-[#D4AF37]">{transferTutorName}</strong>. Um evento oficial foi registrado na Linha do Tempo e o histórico permanece ativo.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer with Delete Danger Zone */}
        {onDeletePlant && (
          <div className="p-4 sm:p-5 bg-stone-50 border-t border-stone-200 rounded-b-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-stone-500">
            <span className="font-mono text-stone-600">
              RG Digital: <strong className="text-[#2D3A2D]">{plant.rgDigital}</strong>
            </span>
            <button
              type="button"
              onClick={() => onDeletePlant(plant.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3.5 py-1.5 rounded-xl border border-red-200 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Planta do Jardim</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
