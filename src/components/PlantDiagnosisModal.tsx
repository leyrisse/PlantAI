import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Stethoscope,
  Activity,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  User,
  Lightbulb,
  Search,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  Plant,
  PlantDiagnosisResult,
  PlantDiagnosisRequest,
  DiagnosticConfidence,
} from '../types';
import { compressImage, validateImageFile } from '../utils/imageUtils';

interface PlantDiagnosisModalProps {
  isOpen: boolean;
  onClose: () => void;
  // If provided, operates on this existing plant (Caminho A)
  plant?: Plant;
  // Optional pre-existing diagnosis result for read-only history viewing
  existingDiagnosis?: PlantDiagnosisResult;
  // Optional initial photo pre-filled from camera capture or result screen
  initialPhotoUrl?: string | null;
  // Optional initial plant species context pre-filled from botanical identification
  initialPlantContext?: {
    species?: string;
    name?: string;
  };
  // Callback when saving the diagnosis to the plant's timeline
  onSaveToTimeline?: (
    diagnosis: PlantDiagnosisResult,
    newStatus?: Plant['status']
  ) => Promise<{ savedInSupabase: boolean }>;
  // Callback if an unregistered plant wants to be added to Garden (Caminho B)
  onAddToGardenFromDiagnosis?: (diagnosis: PlantDiagnosisResult) => void;
  onShowToast: (message: string) => void;
}

const COMMON_SYMPTOMS = [
  'Folhas amareladas',
  'Folhas murchas ou caídas',
  'Manchas escuras ou necrose',
  'Bordas secas ou queimadas',
  'Insetos ou teias visíveis',
  'Queda repentina de folhas',
  'Crescimento estagnado',
  'Caules amolecidos ou escuros',
];

export const PlantDiagnosisModal: React.FC<PlantDiagnosisModalProps> = ({
  isOpen,
  onClose,
  plant,
  existingDiagnosis,
  initialPhotoUrl,
  initialPlantContext,
  onSaveToTimeline,
  onAddToGardenFromDiagnosis,
  onShowToast,
}) => {
  // Photos state: 3 fixed slots (General, Leaf, Stem/Substrate)
  const FIXED_SLOTS = [
    {
      slot: 'general' as const,
      label: 'Foto 1: Visão Geral da Planta',
      shortName: 'Foto 1 (Visão Geral)',
      description: 'Enquadre a planta inteira com vaso e postura geral',
    },
    {
      slot: 'leaf' as const,
      label: 'Foto 2: Detalhe das Folhas/Flores',
      shortName: 'Foto 2 (Detalhe da Folha)',
      description: 'Aproxime da folha com sintomas (manchas, bordas secas, insetos)',
    },
    {
      slot: 'stem_substrate' as const,
      label: 'Foto 3: Caule ou Substrato',
      shortName: 'Foto 3 (Caule/Substrato)',
      description: 'Foco na base do caule, colo da planta e superfície do solo',
    },
  ];

  type PhotoSlotData = {
    dataUrl: string;
    slot: 'general' | 'leaf' | 'stem_substrate';
    label: string;
  };

  const [photoSlots, setPhotoSlots] = useState<Array<PhotoSlotData | null>>([
    null,
    null,
    null,
  ]);
  const [activeSlotTarget, setActiveSlotTarget] = useState<number>(0);

  // Symptoms and environment (All 100% optional)
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [soilState, setSoilState] = useState<
    'MUITO_SECO' | 'UMIDO' | 'ENCHARCADO' | 'NAO_TENHO_CERTEZA' | ''
  >('');
  const [drainageHoles, setDrainageHoles] = useState<'SIM' | 'NAO' | 'NAO_SEI' | ''>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');

  // Process and UI states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('Preparando fotografias...');
  const [diagnosisResult, setDiagnosisResult] = useState<PlantDiagnosisResult | null>(
    existingDiagnosis || null
  );
  const [diagnosisMeta, setDiagnosisMeta] = useState<{
    modelUsed?: string;
    durationMs?: number;
    attemptsCount?: number;
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    errorType: string;
    httpStatus?: number;
    message: string;
    attempts?: Array<{
      model: string;
      httpStatus: number;
      errorType: string;
      durationMs: number;
    }>;
  } | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(Boolean(existingDiagnosis));
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [statusUpdated, setStatusUpdated] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initial photo or existing diagnosis when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorState(null);
      if (existingDiagnosis) {
        setDiagnosisResult(existingDiagnosis);
        setDiagnosisMeta(null);
        setIsSaved(true);
      } else if (initialPhotoUrl) {
        setPhotoSlots((prev) => {
          if (prev[0]?.dataUrl === initialPhotoUrl) return prev;
          const next = [...prev];
          next[0] = {
            dataUrl: initialPhotoUrl,
            slot: FIXED_SLOTS[0].slot,
            label: FIXED_SLOTS[0].label,
          };
          return next;
        });
      }
    }
  }, [isOpen, initialPhotoUrl, existingDiagnosis]);

  if (!isOpen) return null;

  // Toggle symptom chip
  const toggleSymptom = (sym: string) => {
    if (selectedSymptoms.includes(sym)) {
      setSelectedSymptoms(selectedSymptoms.filter((s) => s !== sym));
    } else {
      setSelectedSymptoms([...selectedSymptoms, sym]);
    }
  };

  // Open file selector for a specific slot
  const handleTriggerFileInput = (slotIndex: number) => {
    setActiveSlotTarget(slotIndex);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle image selected from file picker
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      onShowToast(validation.error || 'Formato de imagem não suportado');
      e.target.value = '';
      return;
    }

    try {
      const compressed = await compressImage(file, 1200, 0.85);
      const targetConfig = FIXED_SLOTS[activeSlotTarget] || FIXED_SLOTS[0];

      setPhotoSlots((prev) => {
        const next = [...prev];
        next[activeSlotTarget] = {
          dataUrl: compressed,
          slot: targetConfig.slot,
          label: targetConfig.label,
        };
        return next;
      });
    } catch (err: any) {
      onShowToast(err?.message || 'Erro ao processar imagem.');
    } finally {
      e.target.value = '';
    }
  };

  // Remove a photo slot without shifting other slots
  const handleRemovePhoto = (slotIdx: number) => {
    setPhotoSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
  };

  // Submit diagnosis request to backend
  const handleRunDiagnosis = async () => {
    const activePhotos = photoSlots.filter((p): p is PhotoSlotData => p !== null);
    if (activePhotos.length === 0) {
      onShowToast('Adicione pelo menos 1 fotografia para iniciar o diagnóstico.');
      return;
    }

    setIsLoading(true);
    setErrorState(null);
    setDiagnosisMeta(null);
    setLoadingStep('Enviando fotografias otimizadas...');

    try {
      const payload: PlantDiagnosisRequest = {
        imagesBase64: activePhotos.map((p) => p.dataUrl),
        imagesMetadata: activePhotos.map((p) => ({
          slot: p.slot,
          label: p.label,
        })),
        plantContext: plant
          ? {
              plantId: plant.id,
              species: plant.species,
              name: plant.name,
              environmentName: plant.environmentName,
              wateringFrequency: plant.structuredCare?.wateringFrequency || plant.careSchedule?.waterFrequencyDays?.toString(),
              sunlightType: plant.structuredCare?.sunlightType || plant.sunlightNeeds,
              lastWatered: plant.careSchedule?.lastWatered,
              substrate: plant.structuredCare?.substrate,
            }
          : initialPlantContext
          ? {
              species: initialPlantContext.species,
              name: initialPlantContext.name,
            }
          : undefined,
        userSymptoms: {
          selectedSymptoms,
          soilStateNow: soilState || undefined,
          potHasDrainageHoles: drainageHoles || undefined,
          additionalDetails: additionalNotes.trim() || undefined,
        },
      };

      setLoadingStep('Avaliando evidências visuais e histórico com IA...');

      const res = await fetch('/api/diagnose-plant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.serviceUnavailable || !json?.success || !json?.data) {
        const status = json?.httpStatus || res.status || 503;
        const errType =
          json?.errorType ||
          json?.code ||
          (status === 429
            ? 'RATE_LIMIT_EXCEEDED'
            : status === 504
            ? 'TIMEOUT'
            : status === 400
            ? 'BAD_REQUEST'
            : status === 401 || status === 403
            ? 'AUTH_ERROR'
            : !res.ok
            ? 'SERVICE_UNAVAILABLE'
            : 'INVALID_RESPONSE');
        const errMsg =
          json?.error ||
          `Serviço temporariamente indisponível (Status HTTP ${status}). Nenhuma análise visual foi realizada.`;

        setErrorState({
          errorType: errType,
          httpStatus: status,
          message: errMsg,
          attempts: Array.isArray(json?.attempts) ? json.attempts : undefined,
        });
        onShowToast(errMsg);
        return;
      }

      setDiagnosisResult(json.data as PlantDiagnosisResult);
      setDiagnosisMeta(json.meta || null);
      setErrorState(null);
      setIsSaved(false);
      setStatusUpdated(false);
    } catch (err: any) {
      console.error('Erro ao realizar diagnóstico:', err);
      const errMsg =
        err?.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'Não foi possível conectar ao servidor de diagnóstico. Verifique sua conexão e tente novamente.';
      setErrorState({
        errorType: 'NETWORK_ERROR',
        message: errMsg,
      });
      onShowToast(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Save diagnosis to plant timeline
  const handleSaveToTimeline = async () => {
    if (!diagnosisResult || !onSaveToTimeline) return;

    try {
      const result = await onSaveToTimeline(diagnosisResult);
      setIsSaved(true);

      if (result.savedInSupabase) {
        onShowToast('✅ Diagnóstico salvo na nuvem (Supabase) e adicionado à linha do tempo!');
      } else {
        onShowToast('📱 Diagnóstico salvo localmente neste dispositivo (modo offline).');
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Erro ao registrar diagnóstico na linha do tempo.');
    }
  };

  // Update status explicitly on user confirmation
  const handleApplyStatusChange = async (newStatus: Plant['status']) => {
    if (!plant || !onSaveToTimeline || !diagnosisResult) return;
    setIsUpdatingStatus(true);
    try {
      await onSaveToTimeline(diagnosisResult, newStatus);
      setStatusUpdated(true);
      onShowToast(`🌿 Status da planta atualizado para "${newStatus === 'NEEDS_CARE' ? 'Requer Cuidados' : newStatus === 'RECOVERING' ? 'Em Recuperação' : 'Saudável'}"!`);
    } catch (err: any) {
      onShowToast(err?.message || 'Erro ao atualizar status da planta.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Reset to create another diagnosis
  const handleReset = () => {
    setDiagnosisResult(null);
    setDiagnosisMeta(null);
    setErrorState(null);
    setPhotoSlots([null, null, null]);
    setSelectedSymptoms([]);
    setSoilState('');
    setDrainageHoles('');
    setAdditionalNotes('');
    setIsSaved(false);
    setStatusUpdated(false);
  };

  const getErrorHeading = (errorType: string) => {
    switch (errorType) {
      case 'RATE_LIMIT_EXCEEDED':
        return 'Limite de Requisições Atingido';
      case 'TIMEOUT':
        return 'Tempo Limite Excedido na Análise';
      case 'AUTH_ERROR':
        return 'Erro de Autenticação no Serviço de IA';
      case 'BAD_REQUEST':
        return 'Imagem ou Solicitação Recusada';
      case 'INVALID_RESPONSE':
        return 'Resposta Estruturalmente Inválida';
      case 'NETWORK_ERROR':
        return 'Falha de Conexão com o Servidor';
      case 'SERVICE_UNAVAILABLE':
      default:
        return 'Serviço Temporariamente Indisponível';
    }
  };

  // Helper for confidence badge colors
  const getConfidenceBadge = (level: DiagnosticConfidence) => {
    switch (level) {
      case 'ALTA':
        return {
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          label: 'Confiança Alta',
        };
      case 'MODERADA':
        return {
          bg: 'bg-amber-100 text-amber-800 border-amber-300',
          label: 'Confiança Moderada',
        };
      case 'BAIXA':
        return {
          bg: 'bg-stone-200 text-stone-800 border-stone-300',
          label: 'Confiança Baixa',
        };
      case 'INCONCLUSIVA':
      default:
        return {
          bg: 'bg-rose-100 text-rose-800 border-rose-300',
          label: 'Análise Inconclusiva',
        };
    }
  };

  // Helper for health status badge
  const getHealthBadge = (status: PlantDiagnosisResult['overallHealthStatus']) => {
    switch (status) {
      case 'BOM':
        return { bg: 'bg-emerald-500 text-white', label: 'Saúde Boa / Sem Danos Graves' };
      case 'ALERTA':
        return { bg: 'bg-amber-500 text-white', label: 'Alerta / Requer Atenção' };
      case 'CRITICO':
        return { bg: 'bg-rose-600 text-white', label: 'Crítico / Risco Iminente' };
      case 'INDETERMINADO':
      default:
        return { bg: 'bg-stone-500 text-white', label: 'Condição Indeterminada' };
    }
  };

  const isReadOnly = Boolean(existingDiagnosis);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="bg-[#FAF8F5] rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-[#5A5A40]/30 my-auto flex flex-col">
        {/* Header */}
        <div className="bg-[#2D3A2D] text-[#F5F5F0] p-5 sm:p-6 rounded-t-3xl flex items-center justify-between border-b border-[#5A5A40]/40 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center shrink-0 text-[#D4AF37]">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded-md border border-[#D4AF37]/30">
                  {plant ? 'Planta do Jardim' : 'Diagnóstico Avulso'}
                </span>
                {isReadOnly && (
                  <span className="text-[10px] font-bold text-stone-300 bg-stone-700/60 px-2 py-0.5 rounded-md">
                    Histórico
                  </span>
                )}
              </div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#F5F5F0] leading-tight">
                {plant
                  ? `Investigação Fitossanitária: ${plant.name}`
                  : initialPlantContext?.name || initialPlantContext?.species
                  ? `Investigação Fitossanitária: ${initialPlantContext.name || initialPlantContext.species}`
                  : 'Investigação Fitossanitária de Planta'}
              </h2>
              {(plant?.species || initialPlantContext?.species) && (
                <p className="text-xs text-[#D4AF37] italic font-serif">
                  {plant?.species || initialPlantContext?.species}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-[#F5F5F0] transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-7 space-y-6 flex-1">
          {/* ========================================================= */}
          {/* VIEW A: FORMULÁRIO DE CAPTURA (Se ainda não há resultado)  */}
          {/* ========================================================= */}
          {!diagnosisResult && !isLoading && !errorState && (
            <div className="space-y-6">
              {/* Instruções */}
              <div className="bg-[#2D3A2D]/5 border border-[#5A5A40]/20 rounded-2xl p-4 text-xs text-[#2D3A2D] space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-[#2D3A2D]">
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  Como funciona o diagnóstico inteligente:
                </p>
                <p className="text-[#5A5A40] leading-relaxed">
                  Envie de 1 a 3 fotografias claras sob luz natural. A <strong>Foto 1 é obrigatória</strong>.
                  Sintomas e observações são opcionais: se não souber responder, a IA analisará puramente a imagem e indicará o que você deve checar presencialmente.
                </p>
              </div>

              {/* Slots de Fotos (1 a 3) */}
              <div>
                <h3 className="font-serif font-bold text-[#2D3A2D] text-sm mb-2 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-[#A68069]" />
                  Fotografias da Planta ({photoSlots.filter(Boolean).length}/3)
                </h3>
                <p className="text-[11px] text-[#5A5A40] mb-3">
                  Recomendado: 1 foto geral, 1 close das folhas afetadas e 1 da base/solo. Preencha em qualquer ordem.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[0, 1, 2].map((slotIdx) => {
                    const existingPhoto = photoSlots[slotIdx];
                    const slotCfg = FIXED_SLOTS[slotIdx];

                    return (
                      <div
                        key={slotIdx}
                        className={`rounded-2xl border-2 border-dashed p-3 flex flex-col items-center justify-center text-center transition-all min-h-[160px] relative ${
                          existingPhoto
                            ? 'border-emerald-500/50 bg-emerald-50/20'
                            : slotIdx === 0
                            ? 'border-[#A68069]/60 bg-white hover:border-[#2D3A2D]'
                            : 'border-[#5A5A40]/30 bg-white/60 hover:border-[#5A5A40]'
                        }`}
                      >
                        {existingPhoto ? (
                          <div className="relative w-full h-full flex flex-col items-center">
                            <img
                              src={existingPhoto.dataUrl}
                              alt={existingPhoto.label}
                              className="w-full h-28 object-cover rounded-xl shadow-xs ring-1 ring-black/10"
                            />
                            <span className="text-[10px] font-bold text-[#2D3A2D] mt-2 truncate max-w-full">
                              {existingPhoto.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(slotIdx)}
                              className="absolute -top-2 -right-2 p-1.5 bg-rose-600 text-white rounded-full shadow-md hover:bg-rose-700 transition-colors cursor-pointer"
                              title="Remover foto deste slot"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2 py-2">
                            <div className="w-10 h-10 rounded-full bg-[#FAF8F5] border border-[#5A5A40]/20 flex items-center justify-center mx-auto text-[#5A5A40]">
                              <Camera className="w-5 h-5 text-[#A68069]" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#2D3A2D]">
                                {slotCfg.shortName}
                              </p>
                              <p className="text-[10px] text-[#5A5A40] max-w-[170px] mx-auto leading-tight">
                                {slotCfg.description}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleTriggerFileInput(slotIdx)}
                              className="text-[11px] font-bold bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] px-3 py-1.5 rounded-xl shadow-2xs transition-colors flex items-center gap-1 mx-auto cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                              Adicionar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sintomas rápidos (Opcional) */}
              <div className="bg-white p-5 rounded-2xl border border-[#5A5A40]/20 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif font-bold text-[#2D3A2D] text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-[#A68069]" />
                    Sintomas Notados (Opcional)
                  </h4>
                  <span className="text-[10px] text-[#5A5A40]">Toque para selecionar</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {COMMON_SYMPTOMS.map((sym) => {
                    const isSelected = selectedSymptoms.includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => toggleSymptom(sym)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                          isSelected
                            ? 'bg-[#2D3A2D] text-[#D4AF37] font-bold border border-[#D4AF37]/50 shadow-2xs'
                            : 'bg-[#FAF8F5] text-[#2D3A2D] border border-[#5A5A40]/30 hover:bg-stone-100'
                        }`}
                      >
                        {isSelected && '✓ '}
                        {sym}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Estado do solo e drenagem (Opcional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-[#5A5A40]/20 space-y-2">
                  <label className="text-xs font-bold text-[#2D3A2D] block">
                    Como o substrato está agora? (Opcional)
                  </label>
                  <select
                    value={soilState}
                    onChange={(e: any) => setSoilState(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-[#5A5A40]/30 rounded-xl px-3 py-2 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069]"
                  >
                    <option value="">Não sei / Não verifiquei</option>
                    <option value="MUITO_SECO">Muito seco (esturricado)</option>
                    <option value="UMIDO">Úmido ao toque</option>
                    <option value="ENCHARCADO">Encharcado / Empapado</option>
                    <option value="NAO_TENHO_CERTEZA">Não tenho certeza</option>
                  </select>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#5A5A40]/20 space-y-2">
                  <label className="text-xs font-bold text-[#2D3A2D] block">
                    O vaso tem furos de drenagem? (Opcional)
                  </label>
                  <select
                    value={drainageHoles}
                    onChange={(e: any) => setDrainageHoles(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-[#5A5A40]/30 rounded-xl px-3 py-2 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069]"
                  >
                    <option value="">Não sei / Não verifiquei</option>
                    <option value="SIM">Sim, a água escorre livremente</option>
                    <option value="NAO">Não tem furos (ou está em cachepot fechado)</option>
                    <option value="NAO_SEI">Não tenho certeza</option>
                  </select>
                </div>
              </div>

              {/* Observações adicionais */}
              <div className="bg-white p-4 rounded-2xl border border-[#5A5A40]/20 space-y-1.5">
                <label className="text-xs font-bold text-[#2D3A2D] block">
                  Algo mais que você queira contar? (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Ex.: Troquei de lugar semana passada, começou o ar condicionado, usei fertilizante há 3 dias..."
                  className="w-full bg-[#FAF8F5] border border-[#5A5A40]/30 rounded-xl p-3 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069]"
                />
              </div>

              {/* Botão de Disparo */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRunDiagnosis}
                  disabled={photoSlots.filter(Boolean).length === 0}
                  className={`w-full py-3.5 px-5 rounded-2xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
                    photoSlots.filter(Boolean).length > 0
                      ? 'bg-[#2D3A2D] hover:bg-[#1a231a] text-[#F5F5F0] border border-[#D4AF37]/50 cursor-pointer'
                      : 'bg-stone-300 text-stone-500 cursor-not-allowed border border-stone-200'
                  }`}
                >
                  <Stethoscope className="w-4 h-4 text-[#D4AF37]" />
                  {photoSlots.filter(Boolean).length === 0
                    ? 'Adicione pelo menos 1 Foto para Iniciar o Diagnóstico'
                    : 'Analisar Saúde da Planta com IA'}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW B: CARREGANDO COM ETAPAS VISUAIS                      */}
          {/* ========================================================= */}
          {isLoading && (
            <div className="py-16 px-4 text-center space-y-5">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-[#2D3A2D]/10 animate-ping" />
                <div className="relative w-20 h-20 rounded-full bg-[#2D3A2D] text-[#D4AF37] flex items-center justify-center shadow-lg border border-[#D4AF37]/40">
                  <RefreshCw className="w-8 h-8 animate-spin" />
                </div>
              </div>

              <div className="space-y-1.5 max-w-md mx-auto">
                <h4 className="font-serif font-bold text-[#2D3A2D] text-lg">
                  Investigação Fitossanitária em Andamento
                </h4>
                <p className="text-xs text-[#5A5A40] leading-relaxed">
                  {loadingStep}
                </p>
              </div>

              <div className="max-w-xs mx-auto bg-stone-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#D4AF37] h-full w-2/3 animate-pulse rounded-full" />
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW D: INDISPONIBILIDADE TÉCNICA / ERRO (SEM LAUDO FAKE) */}
          {/* ========================================================= */}
          {errorState && !isLoading && !diagnosisResult && (
            <div className="space-y-5 animate-fadeIn">
              <div className="bg-white p-6 rounded-3xl border border-rose-200 shadow-sm space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0 text-rose-700">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                        Indisponibilidade Técnica
                      </span>
                      {errorState.httpStatus && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                          HTTP {errorState.httpStatus} • {errorState.errorType}
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif font-bold text-[#2D3A2D] text-lg">
                      {getErrorHeading(errorState.errorType)}
                    </h3>
                  </div>
                </div>

                <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-4 text-xs text-rose-950 space-y-1.5">
                  <p className="font-bold">
                    Nenhuma análise visual foi realizada e nenhum diagnóstico foi emitido.
                  </p>
                  <p className="text-rose-900 leading-relaxed">
                    {errorState.message}
                  </p>
                </div>

                <div className="bg-[#FAF8F5] border border-[#5A5A40]/20 rounded-2xl p-4 text-xs text-[#5A5A40] flex items-start gap-2">
                  <Info className="w-4 h-4 text-[#A68069] shrink-0 mt-0.5" />
                  <p>
                    Suas {photoSlots.filter(Boolean).length} fotografia(s) e observações foram preservadas. Você pode tentar novamente agora mesmo ou ajustar as fotos antes de reenviar.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-[#5A5A40]/15">
                  <button
                    type="button"
                    onClick={() => setErrorState(null)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-2xl text-xs font-bold bg-white text-[#2D3A2D] border border-[#5A5A40]/30 hover:bg-stone-50 transition-colors cursor-pointer"
                  >
                    Voltar e Editar Fotos / Sintomas
                  </button>
                  <button
                    type="button"
                    onClick={handleRunDiagnosis}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#2D3A2D] hover:bg-[#1a231a] text-[#F5F5F0] border border-[#D4AF37]/50 shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 text-[#D4AF37]" />
                    Tentar Novamente
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW C: RESULTADO DO DIAGNÓSTICO ESTRUTURADO (4 PILARES)  */}
          {/* ========================================================= */}
          {diagnosisResult && !isLoading && (
            <div className="space-y-6 animate-fadeIn">
              {/* Banner diferenciando Diagnóstico Concluído vs Resultado Inconclusivo */}
              {diagnosisResult.confidenceLevel === 'INCONCLUSIVA' ? (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-950">
                  <HelpCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-amber-900">
                      Resultado Inconclusivo — Análise Visual Realizada pela IA
                    </p>
                    <p className="text-amber-900/90 leading-relaxed">
                      As fotografias foram inspecionadas pelo modelo de visão, mas não houve evidência visual suficiente para confirmar uma causa única. Confira abaixo o que foi observado e o que verificar presencialmente ou envie fotos mais nítidas.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-emerald-900">
                      Diagnóstico Concluído — Análise Visual Realizada pela IA
                    </p>
                    <p className="text-emerald-800 text-[11px]">
                      Laudo estruturado gerado a partir da inspeção real das fotografias enviadas
                      {diagnosisMeta?.durationMs
                        ? ` em ${(diagnosisMeta.durationMs / 1000).toFixed(1)}s.`
                        : '.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Card Resumo do Laudo */}
              <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#5A5A40]/30 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#5A5A40]/15 pb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full shadow-2xs ${getHealthBadge(diagnosisResult.overallHealthStatus).bg}`}>
                      {getHealthBadge(diagnosisResult.overallHealthStatus).label}
                    </span>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getConfidenceBadge(diagnosisResult.confidenceLevel).bg}`}>
                      {getConfidenceBadge(diagnosisResult.confidenceLevel).label}
                    </span>
                  </div>

                  <span className="text-[11px] text-[#5A5A40]">
                    Emitido em: {new Date(diagnosisResult.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <div>
                  <h3 className="font-serif font-bold text-[#2D3A2D] text-base sm:text-lg">
                    {diagnosisResult.conditionSummary}
                  </h3>
                  <p className="text-xs text-[#5A5A40] mt-1.5 leading-relaxed bg-[#FAF8F5] p-3 rounded-2xl border border-[#5A5A40]/15">
                    <strong>Fundamentação da Confiança:</strong> {diagnosisResult.confidenceReasoning}
                  </p>
                </div>
              </div>

              {/* GRID DOS 4 PILARES DE INFORMAÇÃO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Evidências Visuais Observadas */}
                <div className="bg-white p-5 rounded-3xl border border-blue-200 shadow-2xs space-y-2.5">
                  <div className="flex items-center gap-2 text-blue-900 border-b border-blue-100 pb-2">
                    <div className="w-7 h-7 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
                      <Eye className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-xs uppercase tracking-wider">
                        1. Evidências Visuais
                      </h4>
                      <span className="text-[10px] text-blue-700">Detectadas nas fotografias</span>
                    </div>
                  </div>

                  {diagnosisResult.visualEvidence.length > 0 ? (
                    <ul className="text-xs text-blue-950 space-y-1.5">
                      {diagnosisResult.visualEvidence.map((ev, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-blue-600 font-bold">•</span>
                          <span>{ev}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-stone-500 italic">Nenhum sinal visual distinto.</p>
                  )}
                </div>

                {/* 2. Informações do Tutor */}
                <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-2.5">
                  <div className="flex items-center gap-2 text-stone-800 border-b border-stone-100 pb-2">
                    <div className="w-7 h-7 rounded-xl bg-stone-100 flex items-center justify-center text-stone-700">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-[#2D3A2D]">
                        2. Contexto do Tutor
                      </h4>
                      <span className="text-[10px] text-stone-600">Histórico e sintomas relatados</span>
                    </div>
                  </div>

                  {diagnosisResult.userReportedContext.length > 0 ? (
                    <ul className="text-xs text-[#2D3A2D] space-y-1.5">
                      {diagnosisResult.userReportedContext.map((ctx, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-[#A68069] font-bold">•</span>
                          <span>{ctx}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-stone-500 italic">Análise realizada puramente por visão computacional.</p>
                  )}
                </div>

                {/* 3. Hipóteses Diagnósticas */}
                <div className="bg-white p-5 rounded-3xl border border-amber-200 shadow-2xs space-y-2.5 md:col-span-2">
                  <div className="flex items-center gap-2 text-amber-900 border-b border-amber-100 pb-2">
                    <div className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-xs uppercase tracking-wider">
                        3. Hipóteses da Inteligência Artificial
                      </h4>
                      <span className="text-[10px] text-amber-700">Causas mais prováveis, ordenadas por relevância biológica</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    {diagnosisResult.hypotheses.map((hyp, i) => (
                      <div
                        key={i}
                        className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200/80 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <h5 className="font-bold text-amber-950 text-sm">
                            {i + 1}. {hyp.causeName}
                          </h5>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-md">
                              {hyp.category.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] font-bold bg-white text-stone-700 px-2 py-0.5 rounded-md border border-stone-200">
                              Probabilidade: {hyp.probability.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>

                        <p className="text-amber-900 leading-relaxed">
                          <strong>Mecanismo fisiológico:</strong> {hyp.physiologicalMechanism}
                        </p>

                        <div className="bg-white p-2.5 rounded-xl border border-amber-200 text-amber-950">
                          <strong>Ação recomendada para esta hipótese:</strong> {hyp.specificAction}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. O que precisa ser verificado presencialmente */}
                <div className="bg-white p-5 rounded-3xl border border-purple-200 shadow-2xs space-y-2.5 md:col-span-2">
                  <div className="flex items-center gap-2 text-purple-900 border-b border-purple-100 pb-2">
                    <div className="w-7 h-7 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
                      <Search className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-xs uppercase tracking-wider">
                        4. Informações que Você Precisa Verificar no Local
                      </h4>
                      <span className="text-[10px] text-purple-700">O que a fotografia não pôde inspecionar presencialmente</span>
                    </div>
                  </div>

                  {diagnosisResult.missingInfoNeeded.length > 0 ? (
                    <ul className="text-xs text-purple-950 space-y-1.5">
                      {diagnosisResult.missingInfoNeeded.map((miss, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-purple-600 font-bold">•</span>
                          <span>{miss}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-stone-500 italic">Nenhuma verificação adicional pendente.</p>
                  )}
                </div>
              </div>

              {/* Plano de Ação: Passos Imediatos e Ajustes Contínuos */}
              <div className="bg-emerald-50/70 p-5 rounded-3xl border border-emerald-200 space-y-3">
                <h4 className="font-serif font-bold text-emerald-950 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Plano de Recuperação da Planta
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 space-y-1.5">
                    <strong className="text-emerald-900 block font-bold">Hoje e Amanhã (Ações Imediatas):</strong>
                    <ul className="space-y-1 text-emerald-950">
                      {diagnosisResult.actionPlan.immediateSteps.map((step, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-600 font-bold">✓</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 space-y-1.5">
                    <strong className="text-emerald-900 block font-bold">Manejo Contínuo (Próximas Semanas):</strong>
                    <ul className="space-y-1 text-emerald-950">
                      {diagnosisResult.actionPlan.ongoingAdjustments.map((step, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-600 font-bold">↻</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* O que NÃO fazer */}
              {diagnosisResult.whatToAvoid.length > 0 && (
                <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200 text-xs space-y-1.5">
                  <h4 className="font-bold text-rose-950 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-700" />
                    O que NÃO fazer (Evite piorar a saúde da planta):
                  </h4>
                  <ul className="text-rose-900 space-y-1">
                    {diagnosisResult.whatToAvoid.map((avoid, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-rose-600 font-bold">✕</span>
                        <span>{avoid}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Alerta de Especialista */}
              {diagnosisResult.consultSpecialistAlert && (
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p>{diagnosisResult.consultSpecialistAlert}</p>
                </div>
              )}

              {/* Sugestão de Alteração de Status (Confirmação 100% Manual) */}
              {plant && diagnosisResult.suggestedStatusChange && !statusUpdated && (
                <div className="bg-[#2D3A2D]/10 p-4 rounded-2xl border border-[#2D3A2D]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <strong className="text-[#2D3A2D] block">
                      Ajuste de Status no Jardim:
                    </strong>
                    <p className="text-[#5A5A40]">
                      A IA sugere alterar o status de <strong>"{plant.status}"</strong> para{' '}
                      <strong>
                        "{diagnosisResult.suggestedStatusChange === 'NEEDS_CARE'
                          ? 'Requer Cuidados'
                          : diagnosisResult.suggestedStatusChange === 'RECOVERING'
                          ? 'Em Recuperação'
                          : 'Saudável'}"
                      </strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyStatusChange(diagnosisResult.suggestedStatusChange!)}
                    disabled={isUpdatingStatus}
                    className="bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] font-bold px-4 py-2 rounded-xl shrink-0 transition-colors border border-[#5A5A40] shadow-xs cursor-pointer"
                  >
                    {isUpdatingStatus ? 'Atualizando...' : 'Confirmar Alteração'}
                  </button>
                </div>
              )}

              {/* Disclaimer */}
              <p className="text-[10px] text-[#5A5A40] text-center italic">
                {diagnosisResult.disclaimer}
              </p>

              {/* Botões de Ação Final */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5 border-t border-[#5A5A40]/20">
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-2xl text-xs font-bold text-[#5A5A40] hover:text-[#2D3A2D] transition-colors"
                  >
                    Fazer Novo Diagnóstico
                  </button>
                )}

                {/* Se planta cadastrada: Salvar na Timeline */}
                {plant && onSaveToTimeline && (
                  <button
                    type="button"
                    onClick={handleSaveToTimeline}
                    disabled={isSaved}
                    className={`w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 ${
                      isSaved
                        ? 'bg-emerald-700 text-white cursor-default'
                        : 'bg-[#2D3A2D] hover:bg-[#1a231a] text-[#F5F5F0] border border-[#D4AF37]/50 cursor-pointer'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                    {isSaved ? 'Registrado na Linha do Tempo' : 'Salvar na Linha do Tempo da Planta'}
                  </button>
                )}

                {/* Se planta avulsa: Adicionar ao Jardim (Opcional) */}
                {!plant && onAddToGardenFromDiagnosis && (
                  <button
                    type="button"
                    onClick={() => onAddToGardenFromDiagnosis(diagnosisResult)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#2D3A2D] hover:bg-[#1a231a] text-[#F5F5F0] border border-[#D4AF37]/50 shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#D4AF37]" />
                    Cadastrar no Meu Jardim
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-2xl text-xs font-bold bg-white text-[#2D3A2D] border border-[#5A5A40]/30 hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
