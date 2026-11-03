import React, { useState, useRef, useEffect } from 'react';
import {
  Plant,
  Environment,
  PlantNetCandidate,
  PlantNetIdentificationResponse,
  SpeciesCareGuide,
  PlantStructuredCare,
  InitialPlantData,
} from '../types';
import {
  DEFAULT_STRUCTURED_CARE,
  deriveStructuredCareFromGuide,
  getWateringDays,
  getFertilizerDays,
  mapSunlightToLegacy,
  mapWaterNeedsLabel,
} from '../utils/careUtils';
import { PlantCareFormFields } from './PlantCareFormFields';
import { SpeciesCareAccordion } from './SpeciesCareAccordion';
import { getLocalTodayDateStr } from '../utils/dateUtils';
import {
  X,
  Sparkles,
  Leaf,
  Camera,
  Upload,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Check,
  ChevronLeft,
  Settings2,
} from 'lucide-react';

interface NewPlantModalProps {
  environments: Environment[];
  onClose: () => void;
  onSavePlant: (plant: Plant) => void;
  initialData?: InitialPlantData;
}

export const NewPlantModal: React.FC<NewPlantModalProps> = ({
  environments,
  onClose,
  onSavePlant,
  initialData,
}) => {
  const [name, setName] = useState(
    initialData?.name || initialData?.popularName || initialData?.scientificName || ''
  );
  const [species, setSpecies] = useState(
    initialData?.species ||
      (initialData?.popularName
        ? `${initialData.popularName} (${initialData.scientificName})`
        : initialData?.scientificName) ||
      ''
  );
  const [popularName, setPopularName] = useState(initialData?.popularName || '');
  const [scientificName, setScientificName] = useState(initialData?.scientificName || '');
  const [envId, setEnvId] = useState(environments[0]?.id || 'env-sala');
  const [collectionName, setCollectionName] = useState('Aráceas Majestosas');
  const [acquisitionStory, setAcquisitionStory] = useState('');
  const [photoUrl, setPhotoUrl] = useState(
    initialData?.photoUrl ||
      'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=800&q=80'
  );

  // Structured Care State
  const [structuredCare, setStructuredCare] = useState<PlantStructuredCare>(() => {
    if (initialData?.careGuide) {
      return deriveStructuredCareFromGuide(initialData.careGuide);
    }
    return { ...DEFAULT_STRUCTURED_CARE };
  });
  const [hasManualCareEdits, setHasManualCareEdits] = useState(false);
  const [pendingGuide, setPendingGuide] = useState<SpeciesCareGuide | null>(null);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);

  // Identification & Mode States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasIdentified, setHasIdentified] = useState(
    Boolean(initialData?.species || initialData?.scientificName)
  );
  const [showFullEdit, setShowFullEdit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [noMatchMessage, setNoMatchMessage] = useState<string | null>(null);
  const [uncertainMatchNotice, setUncertainMatchNotice] = useState<string | null>(null);
  const [selectedOrgan, setSelectedOrgan] = useState<string>('auto');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showCameraStream, setShowCameraStream] = useState(false);

  // Specific species care guide state
  const [fetchedCareGuide, setFetchedCareGuide] = useState<SpeciesCareGuide | null>(
    initialData?.careGuide || null
  );
  const [isLoadingCareGuide, setIsLoadingCareGuide] = useState(false);
  const [careGuideError, setCareGuideError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Stop camera tracks on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Attach stream to video tag whenever live camera view opens
  useEffect(() => {
    if (showCameraStream && videoRef.current && mediaStreamRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
    }
  }, [showCameraStream]);

  // Helper to compress and format image
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('Falha ao processar arquivo de imagem'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Erro na leitura do arquivo'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImage(file);
      setPhotoUrl(compressedDataUrl);
      setAnalysisError(null);
      setNoMatchMessage(null);
      setUncertainMatchNotice(null);
    } catch (err: any) {
      setAnalysisError(err.message || 'Erro ao carregar imagem selecionada');
    } finally {
      e.target.value = '';
    }
  };

  // Start live camera stream or fallback to native camera file input
  const handleStartCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setShowCameraStream(true);
    } catch (err) {
      console.warn('Live camera stream unavailable, falling back to capture input:', err);
      cameraInputRef.current?.click();
    }
  };

  const handleStopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setShowCameraStream(false);
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setPhotoUrl(dataUrl);
      setAnalysisError(null);
      setNoMatchMessage(null);
      setUncertainMatchNotice(null);
    }
    handleStopCamera();
  };

  // Identify plant via backend API and automatically select the best match
  const handleIdentify = async () => {
    if (!photoUrl) {
      setAnalysisError('Selecione ou tire uma foto da planta primeiro.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setNoMatchMessage(null);
    setUncertainMatchNotice(null);

    try {
      const response = await fetch('/api/identify-plant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: photoUrl,
          organ: selectedOrgan,
        }),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        throw new Error(
          `O servidor retornou uma resposta inesperada (Status HTTP ${response.status}). Verifique se o backend está ativo e se a chave de identificação está configurada.`
        );
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível identificar a planta. Tente novamente com outra foto.');
      }

      const result = data as PlantNetIdentificationResponse;

      if (result.candidates && result.candidates.length > 0) {
        // Automatically select the candidate with highest compatibility (first candidate)
        const topCandidate: PlantNetCandidate = result.candidates[0];
        const sci = topCandidate.scientificNameWithoutAuthor || '';
        const pop = topCandidate.commonNames && topCandidate.commonNames.length > 0 ? topCandidate.commonNames[0] : '';
        const combined = pop ? `${pop} (${sci})` : sci;

        setScientificName(sci);
        setPopularName(pop);
        setSpecies(combined);

        // Pre-fill nickname if empty
        if (!name.trim()) {
          setName(pop || sci || 'Minha Planta');
        }

        // Check if confidence is low
        if (topCandidate.scorePercentage < 20) {
          setUncertainMatchNotice(
            `A espécie identificada é incerta (${topCandidate.scorePercentage}% de compatibilidade). Se necessário, utilize o botão "Alterar" para ajustar as informações.`
          );
        }

        // Set identified state and switch to compact summary
        setHasIdentified(true);
        setShowFullEdit(false);

        // Fetch care recommendations automatically for the top candidate
        fetchCareGuideForSpecies(sci, pop || undefined, topCandidate.family);
      } else {
        setNoMatchMessage(
          'A espécie não foi identificada com certeza. Tente novamente com uma foto mais nítida ou preencha os dados manualmente.'
        );
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Erro ao identificar a planta. Verifique a conexão e tente novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyGuideToStructuredCare = (guide: SpeciesCareGuide) => {
    const derived = deriveStructuredCareFromGuide(guide);
    setStructuredCare(derived);
    setHasManualCareEdits(false);
    setShowOverwriteModal(false);
    setPendingGuide(null);
  };

  const handleKeepManualEdits = () => {
    setShowOverwriteModal(false);
    setPendingGuide(null);
  };

  const fetchCareGuideForSpecies = async (sciName: string, comName?: string, family?: string) => {
    if (!sciName || !sciName.trim()) return;
    setIsLoadingCareGuide(true);
    setCareGuideError(null);
    try {
      const response = await fetch('/api/species-care-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scientificName: sciName,
          commonName: comName,
          family,
        }),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        throw new Error(
          `O servidor retornou uma resposta inválida (Status HTTP ${response.status}) ao obter o guia da espécie.`
        );
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível carregar as orientações da espécie.');
      }

      const guide = data.data as SpeciesCareGuide;
      setFetchedCareGuide(guide);

      // If user has already made manual care edits, ask before overwriting
      if (hasManualCareEdits) {
        setPendingGuide(guide);
        setShowOverwriteModal(true);
      } else {
        applyGuideToStructuredCare(guide);
      }
    } catch (err: any) {
      console.warn('Erro ao obter guia de cultivo:', err);
      setCareGuideError(err.message || 'Não foi possível carregar as orientações da espécie.');
    } finally {
      setIsLoadingCareGuide(false);
    }
  };

  // Formatters for compact unalterable summary
  const getWateringSummaryLine = (): string => {
    const map: Record<string, string> = {
      daily: 'Diariamente (a cada 1 dia)',
      every_2_days: 'A cada 2 dias',
      every_3_days: 'A cada 3 dias',
      weekly: 'Semanalmente (a cada 7 dias)',
      biweekly: 'A cada 15 dias',
      custom: `A cada ${structuredCare.customWateringDays || 7} dias`,
    };
    const freq = map[structuredCare.wateringFrequency] || 'Semanalmente (a cada 7 dias)';
    return structuredCare.wateringCheckMethod ? `${freq} • ${structuredCare.wateringCheckMethod}` : freq;
  };

  const getSunlightSummaryLine = (): string => {
    const map: Record<string, string> = {
      direct_sun: 'Sol direto',
      bright_indirect: 'Luz indireta intensa',
      partial_shade: 'Meia-sombra',
      shade: 'Sombra',
      other: 'Outra luminosidade',
    };
    const sun = map[structuredCare.sunlightType] || 'Luz indireta intensa';
    return structuredCare.sunlightNotes ? `${sun} (${structuredCare.sunlightNotes})` : sun;
  };

  // Primary save action: saves immediately with current care fields (preventing duplicate clicks)
  const handleSave = () => {
    if (isSaving) return;

    const plantName = name.trim() || popularName || scientificName || 'Minha Planta';
    const plantSpecies = species.trim() || scientificName || 'Espécie não informada';

    setIsSaving(true);

    try {
      const selectedEnv = environments.find((env) => env.id === envId);
      const generatedId = `plant-${Date.now()}`;
      const generatedCode = `JRD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const todayStr = getLocalTodayDateStr();

      const wateringDays = getWateringDays(structuredCare.wateringFrequency, structuredCare.customWateringDays);
      const fertilizeDays = getFertilizerDays(structuredCare.fertilizerFrequency, structuredCare.customFertilizerDays);
      const legacySunlight = mapSunlightToLegacy(structuredCare.sunlightType);
      const legacyWaterNeeds = mapWaterNeedsLabel(wateringDays);

      const newPlant: Plant = {
        id: generatedId,
        name: plantName,
        species: plantSpecies,
        rgDigital: generatedCode,
        photo: photoUrl,
        environmentId: envId,
        environmentName: selectedEnv?.name || 'Sala de Estar',
        collectionName,
        birthDate: todayStr,
        status: 'HEALTHY',
        healthScore: 100,
        sunlightNeeds: legacySunlight,
        waterNeeds: legacyWaterNeeds,
        acquisitionStory: acquisitionStory || 'Registrada com carinho no aplicativo Jardim.',
        structuredCare: { ...structuredCare },
        careSchedule: {
          waterFrequencyDays: wateringDays,
          fertilizeFrequencyDays: fertilizeDays,
          pruneFrequencyDays: 90,
          lastWatered: todayStr,
          lastFertilized: todayStr,
          lastPruned: todayStr,
        },
        tutors: [
          {
            id: 'tutor-1',
            name: 'Camila Silva (Tutor Principal)',
            role: 'Tutor Principal',
            avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
            joinedDate: todayStr,
          },
        ],
        timeline: [
          {
            id: `evt-${Date.now()}`,
            date: todayStr,
            type: 'MILESTONE',
            title: 'Chegada ao Jardim',
            description: `Planta cadastrada no ecossistema Jardim. ${acquisitionStory}`,
            authorName: 'Camila Silva',
            authorRole: 'Tutor Principal',
          },
        ],
        isOrphan: false,
        careGuide: fetchedCareGuide || undefined,
      };

      onSavePlant(newPlant);
      onClose();
    } catch (err) {
      console.error('Erro ao cadastrar planta:', err);
      setIsSaving(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 border border-[#5A5A40]/30 shadow-2xl space-y-6 my-auto max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#5A5A40]/20 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#2D3A2D] text-[#D4AF37] flex items-center justify-center font-bold">
              <Leaf className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold text-[#2D3A2D]">Cadastrar Nova Planta</h3>
              <p className="text-xs text-[#5A5A40]">Identificação botânica por IA</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#5A5A40] hover:text-[#2D3A2D] p-1.5 rounded-xl hover:bg-[#F5F5F0] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden File & Camera Inputs */}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={cameraInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Live Camera Viewfinder Overlay (when active) */}
        {showCameraStream && (
          <div className="bg-[#1f291f] text-white p-4 rounded-2xl space-y-3 border border-[#D4AF37]/40 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#D4AF37]">
                <Camera className="w-4 h-4 animate-pulse" />
                Câmera em Tempo Real
              </div>
              <button
                type="button"
                onClick={handleStopCamera}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-black aspect-4/3 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleCaptureSnapshot}
                className="px-5 py-2.5 bg-[#D4AF37] hover:bg-[#c29e2f] text-[#2D3A2D] font-bold text-xs rounded-xl shadow-md transition-colors flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Fotografar Planta
              </button>
              <button
                type="button"
                onClick={handleStopCamera}
                className="px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-xl transition-colors"
              >
                Cancelar Câmera
              </button>
            </div>
          </div>
        )}

        {/* Photo Selection, Preview and AI Recognition */}
        <div className="bg-[#FAF8F5] border border-[#5A5A40]/25 rounded-2xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#2D3A2D] uppercase tracking-wider flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-[#5A5A40]" />
              Fotografia da Planta
            </span>
            <span className="text-[11px] text-[#5A5A40]">Dispositivo ou Câmera</span>
          </div>

          {/* Image Preview & Controls */}
          <div className="flex flex-col sm:flex-row gap-3.5 items-center sm:items-start">
            <div className="relative w-full sm:w-36 h-36 rounded-xl overflow-hidden bg-[#2D3A2D]/10 border border-[#5A5A40]/30 shrink-0 shadow-xs">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Prévia da planta"
                  className="w-full h-full object-cover"
                  onError={() => setPhotoUrl('https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=800&q=80')}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-[#5A5A40] text-xs gap-1">
                  <Leaf className="w-6 h-6 opacity-40" />
                  <span>Sem imagem</span>
                </div>
              )}
            </div>

            <div className="flex-1 w-full space-y-2.5">
              <p className="text-xs text-[#5A5A40]">
                Tire uma foto clara da planta ou carregue um arquivo para identificar a espécie.
              </p>

              {/* Action Buttons for Image */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleStartCamera}
                  className="px-3 py-2 bg-white hover:bg-[#F5F5F0] text-[#2D3A2D] text-xs font-semibold rounded-xl border border-[#5A5A40]/30 transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Camera className="w-3.5 h-3.5 text-[#2D3A2D]" />
                  Tirar Foto
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 bg-white hover:bg-[#F5F5F0] text-[#2D3A2D] text-xs font-semibold rounded-xl border border-[#5A5A40]/30 transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5 text-[#2D3A2D]" />
                  Escolher Arquivo
                </button>
              </div>

              {/* Organ selection */}
              <div className="pt-1">
                <span className="text-[11px] font-semibold text-[#5A5A40] block mb-1">
                  Órgão vegetal fotografado:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'auto', label: 'Automático' },
                    { id: 'leaf', label: 'Folha' },
                    { id: 'flower', label: 'Flor' },
                    { id: 'fruit', label: 'Fruto' },
                    { id: 'bark', label: 'Caule/Tronco' },
                  ].map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => setSelectedOrgan(org.id)}
                      className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                        selectedOrgan === org.id
                          ? 'bg-[#2D3A2D] text-white border-[#2D3A2D]'
                          : 'bg-white hover:bg-[#F5F5F0] text-[#5A5A40] border-[#5A5A40]/25'
                      }`}
                    >
                      {org.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Identification Button */}
              <button
                type="button"
                onClick={handleIdentify}
                disabled={isAnalyzing || !photoUrl}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#2D3A2D] hover:bg-[#1f291f] disabled:bg-[#2D3A2D]/60 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 border border-[#D4AF37]/50"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
                    <span>Identificando planta...</span>
                  </>
                ) : (
                  <>
                    <Leaf className="w-4 h-4 text-[#D4AF37]" />
                    <span>Procurar com IA</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Analysis Error Notification */}
          {analysisError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Não foi possível identificar a planta</p>
                <p className="text-[11px] text-red-700 mt-0.5">{analysisError}</p>
              </div>
              <button
                type="button"
                onClick={() => setAnalysisError(null)}
                className="text-red-500 hover:text-red-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Uncertain Match Notice */}
          {uncertainMatchNotice && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Identificação aproximada</p>
                <p className="text-[11px] text-amber-800 mt-0.5">{uncertainMatchNotice}</p>
              </div>
              <button
                type="button"
                onClick={() => setUncertainMatchNotice(null)}
                className="text-amber-500 hover:text-amber-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* No Match Notification */}
          {noMatchMessage && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Nenhuma espécie conclusiva</p>
                <p className="text-[11px] text-amber-700 mt-0.5">{noMatchMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setNoMatchMessage(null)}
                className="text-amber-500 hover:text-amber-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Loading Care Guide Notification */}
          {isLoadingCareGuide && (
            <div className="p-3 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs animate-fadeIn">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              <span>Buscando informações da espécie...</span>
            </div>
          )}
        </div>

        {/* COMPACT UNALTERABLE SUMMARY (When identified and not in full edit mode) */}
        {hasIdentified && !showFullEdit && (
          <div className="bg-[#F5F8F5] border-2 border-[#2D3A2D]/25 rounded-2xl p-5 space-y-4 shadow-xs animate-fadeIn">
            <div className="flex items-center justify-between border-b border-[#2D3A2D]/15 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#2D3A2D]">
                    Espécie Identificada & Cuidados Recomendados
                  </h4>
                  <p className="text-[11px] text-[#5A5A40]">
                    Recomendações obtidas com sucesso
                  </p>
                </div>
              </div>

              {/* Secondary button: "Alterar" */}
              <button
                type="button"
                onClick={() => setShowFullEdit(true)}
                className="px-3 py-1.5 bg-white hover:bg-[#FAF8F5] text-[#2D3A2D] text-xs font-bold rounded-xl border border-[#5A5A40]/30 shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <Settings2 className="w-3.5 h-3.5 text-[#5A5A40]" />
                Alterar
              </button>
            </div>

            {/* Read-Only, Unalterable Summary Lines */}
            <div className="space-y-2.5 py-1 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 bg-white/70 p-2.5 rounded-xl border border-[#2D3A2D]/10">
                <span className="font-bold text-[#5A5A40] shrink-0 uppercase tracking-wider text-[10px]">
                  Espécie:
                </span>
                <span className="font-bold text-[#2D3A2D] text-sm">
                  {popularName ? (
                    <>
                      <span>{popularName}</span>{' '}
                      <span className="font-normal italic text-[#5A5A40] text-xs">({scientificName})</span>
                    </>
                  ) : (
                    <span className="italic">{scientificName || species}</span>
                  )}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 bg-white/70 p-2.5 rounded-xl border border-[#2D3A2D]/10">
                <span className="font-bold text-[#5A5A40] shrink-0 uppercase tracking-wider text-[10px]">
                  Rega:
                </span>
                <span className="font-medium text-[#2D3A2D]">
                  {getWateringSummaryLine()}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 bg-white/70 p-2.5 rounded-xl border border-[#2D3A2D]/10">
                <span className="font-bold text-[#5A5A40] shrink-0 uppercase tracking-wider text-[10px]">
                  Iluminação:
                </span>
                <span className="font-medium text-[#2D3A2D]">
                  {getSunlightSummaryLine()}
                </span>
              </div>
            </div>

            {/* Nickname & Environment quick preview if desired */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-[#5A5A40] uppercase tracking-wider mb-1">
                  Nome / Apelido
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Maya"
                  className="w-full bg-white border border-[#5A5A40]/30 rounded-xl px-3 py-2 text-xs text-[#2D3A2D] font-semibold focus:outline-none focus:ring-2 focus:ring-[#A68069]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5A5A40] uppercase tracking-wider mb-1">
                  Ambiente
                </label>
                <select
                  value={envId}
                  onChange={(e) => setEnvId(e.target.value)}
                  className="w-full bg-white border border-[#5A5A40]/30 rounded-xl px-3 py-2 text-xs text-[#2D3A2D] font-semibold focus:outline-none focus:ring-2 focus:ring-[#A68069]"
                >
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons: Cadastrar planta (primary) & Alterar (secondary) */}
            <div className="pt-3 border-t border-[#2D3A2D]/15 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowFullEdit(true)}
                className="px-4 py-2.5 bg-white hover:bg-[#FAF8F5] text-[#2D3A2D] text-xs font-bold rounded-xl border border-[#5A5A40]/30 shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <Settings2 className="w-3.5 h-3.5 text-[#5A5A40]" />
                Alterar
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2.5 bg-[#2D3A2D] hover:bg-[#1f291f] disabled:bg-[#2D3A2D]/60 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 border border-[#D4AF37]/50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-[#D4AF37]" />
                    <span>Cadastrar planta</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* FULL EDIT MODE (Or initial manual mode before AI identification) */}
        {(!hasIdentified || showFullEdit) && (
          <form onSubmit={handleFormSubmit} className="space-y-4 animate-fadeIn">
            {/* If in full edit mode, provide option to return to summary */}
            {hasIdentified && (
              <div className="flex items-center justify-between p-3 bg-stone-100 rounded-2xl border border-stone-200">
                <span className="text-xs font-semibold text-[#2D3A2D]">
                  Editando detalhes completos da planta
                </span>
                <button
                  type="button"
                  onClick={() => setShowFullEdit(false)}
                  className="px-3 py-1.5 bg-white hover:bg-stone-50 text-[#2D3A2D] text-xs font-bold rounded-xl border border-stone-300 shadow-2xs transition-colors flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Voltar ao resumo
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#2D3A2D] uppercase tracking-wider mb-1">
                Nome Afetivo / Apelido da Planta <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Maya, Beto, Luna"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#F5F5F0] border border-[#5A5A40]/30 rounded-2xl px-3.5 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069] font-medium"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-[#2D3A2D] uppercase tracking-wider">
                  Espécie Botânica <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-[#5A5A40]">Você pode editar livremente</span>
              </div>
              <input
                type="text"
                placeholder="Ex: Monstera deliciosa (Costela-de-Adão)"
                value={species}
                onChange={(e) => {
                  setSpecies(e.target.value);
                  setScientificName(e.target.value);
                }}
                className="w-full bg-[#F5F5F0] border border-[#5A5A40]/30 rounded-2xl px-3.5 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069]"
                required
              />

              {/* Quick trigger to fetch care guide if manual species entered */}
              {!fetchedCareGuide && !isLoadingCareGuide && species.trim().length >= 3 && (
                <button
                  type="button"
                  onClick={() => fetchCareGuideForSpecies(species)}
                  className="text-[11px] text-emerald-800 hover:text-emerald-950 font-semibold underline flex items-center gap-1.5 mt-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Buscar informações de cultivo para "{species}"
                </button>
              )}

              {/* Loading state */}
              {isLoadingCareGuide && (
                <div className="mt-2.5 p-3 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs animate-fadeIn">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                  <span>Buscando informações da espécie...</span>
                </div>
              )}

              {/* Error state */}
              {careGuideError && (
                <div className="mt-2 p-2.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs flex items-center justify-between animate-fadeIn">
                  <span>{careGuideError}</span>
                  <button
                    type="button"
                    onClick={() => fetchCareGuideForSpecies(species)}
                    className="underline font-bold text-amber-900 ml-2 cursor-pointer"
                  >
                    Tentar de novo
                  </button>
                </div>
              )}

              {/* Overwrite Confirmation Modal / Banner if user has manual edits */}
              {showOverwriteModal && pendingGuide && (
                <div className="mt-3 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm space-y-3 animate-fadeIn">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-amber-950">
                        Substituir alterações manuais de cuidados?
                      </h5>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        Foram obtidas recomendações para <strong>{pendingGuide.scientificName}</strong>. Deseja aplicar as novas recomendações aos campos ou manter suas alterações manuais?
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 justify-end">
                    <button
                      type="button"
                      onClick={handleKeepManualEdits}
                      className="px-3 py-1.5 bg-white hover:bg-stone-100 text-[#2D3A2D] text-xs font-semibold rounded-xl border border-stone-300 transition-colors cursor-pointer"
                    >
                      Manter minhas alterações
                    </button>
                    <button
                      type="button"
                      onClick={() => applyGuideToStructuredCare(pendingGuide)}
                      className="px-3.5 py-1.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
                      Substituir pelos recomendados
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#2D3A2D] uppercase tracking-wider mb-1">
                  Ambiente / Cômodo
                </label>
                <select
                  value={envId}
                  onChange={(e) => setEnvId(e.target.value)}
                  className="w-full bg-[#F5F5F0] border border-[#5A5A40]/30 rounded-2xl px-3.5 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069] font-semibold"
                >
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2D3A2D] uppercase tracking-wider mb-1">
                  Coleção
                </label>
                <select
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  className="w-full bg-[#F5F5F0] border border-[#5A5A40]/30 rounded-2xl px-3.5 py-2.5 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069] font-semibold"
                >
                  <option value="Aráceas Majestosas">Aráceas Majestosas</option>
                  <option value="Coleção Raridades">Coleção Raridades</option>
                  <option value="Plantas Resgatadas">Plantas Resgatadas</option>
                  <option value="Ervas & Temperos">Ervas & Temperos</option>
                  <option value="Suculentas & Cactos">Suculentas & Cactos</option>
                </select>
              </div>
            </div>

            {/* Structured Care Form Fields */}
            <div className="pt-1">
              <PlantCareFormFields
                care={structuredCare}
                onChange={(newCare) => {
                  setStructuredCare(newCare);
                  setHasManualCareEdits(true);
                }}
              />
            </div>

            {/* Collapsible Accordion: Diretrizes da espécie (collapsed by default) */}
            {fetchedCareGuide && (
              <div className="pt-1">
                <SpeciesCareAccordion careGuide={fetchedCareGuide} defaultOpen={false} />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#2D3A2D] uppercase tracking-wider mb-1">
                História da Chegada / Origem Afetiva
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Ganhei de presente do meu irmão quando mudei para o novo apartamento."
                value={acquisitionStory}
                onChange={(e) => setAcquisitionStory(e.target.value)}
                className="w-full bg-[#F5F5F0] border border-[#5A5A40]/30 rounded-2xl p-3 text-xs text-[#2D3A2D] focus:outline-none focus:ring-2 focus:ring-[#A68069]"
              />
            </div>

            <div className="pt-4 border-t border-[#5A5A40]/15 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {hasIdentified && (
                  <button
                    type="button"
                    onClick={() => setShowFullEdit(false)}
                    className="px-3.5 py-2 rounded-2xl text-xs font-bold text-[#2D3A2D] hover:bg-[#F5F5F0] border border-[#5A5A40]/30 transition-colors flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Voltar ao resumo
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-2xl text-xs font-bold text-[#5A5A40] hover:bg-[#F5F5F0] transition-colors"
                >
                  Cancelar
                </button>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-[#2D3A2D] hover:bg-[#1f291f] disabled:bg-[#2D3A2D]/60 text-[#F5F5F0] font-bold text-xs rounded-2xl shadow-xs transition-colors flex items-center gap-1.5 border border-[#5A5A40]"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
                    <span>Cadastrando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-[#D4AF37]" />
                    <span>Cadastrar planta</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
