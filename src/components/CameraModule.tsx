import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  RefreshCw,
  Image as ImageIcon,
  Plus,
  X,
  FlipHorizontal,
  Sparkles,
  Leaf,
  AlertCircle,
  AlertTriangle,
  Flower2,
  BookmarkPlus,
  CheckCircle2,
  Droplets,
  Sun,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import {
  PlantNetCandidate,
  PlantNetIdentificationResponse,
  SpeciesCareGuide,
  InitialPlantData,
  WishListItem,
  PlantDiagnosisResult,
} from '../types';
import { SpeciesCareAccordion } from './SpeciesCareAccordion';
import { compressImage, validateImageFile } from '../utils/imageUtils';
import { PlantDiagnosisModal } from './PlantDiagnosisModal';

interface CameraModuleProps {
  onAddToGarden: (plantData: InitialPlantData) => void;
  onAddToWishList: (item: WishListItem) => void;
  onShowToast: (message: string) => void;
}

type ViewState = 'CAMERA' | 'IDENTIFYING' | 'RESULT' | 'ERROR';

export const CameraModule: React.FC<CameraModuleProps> = ({
  onAddToGarden,
  onAddToWishList,
  onShowToast,
}) => {
  const [viewState, setViewState] = useState<ViewState>('CAMERA');
  const [isDiagnosisModalOpen, setIsDiagnosisModalOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Organ selection
  const [selectedOrgan, setSelectedOrgan] = useState<string>('auto');

  // Captured / Selected image
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('Identificando planta...');
  const [identificationError, setIdentificationError] = useState<string | null>(null);

  // Identified result
  const [identifiedResult, setIdentifiedResult] = useState<{
    scientificName: string;
    popularName?: string;
    family?: string;
    scorePercentage?: number;
    careGuide?: SpeciesCareGuide;
  } | null>(null);

  // Menu state in Result Screen (button '+')
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSavedToWishList, setIsSavedToWishList] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check available camera devices
  const checkDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      }
    } catch (e) {
      console.warn('Erro ao verificar dispositivos de vídeo:', e);
    }
  };

  // Start live camera stream
  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Seu navegador não oferece suporte direto à câmera em tempo real. Você pode selecionar fotos da galeria.');
      setIsCameraActive(false);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      checkDevices();
    } catch (err: any) {
      console.warn('Falha ao abrir câmera:', err);
      let msg = 'Não foi possível acessar a câmera do dispositivo.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permissão para usar a câmera foi negada. Permita o acesso nas configurações do navegador ou envie uma foto da galeria.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Nenhuma câmera conectada foi encontrada. Você pode carregar uma foto da galeria.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'A câmera está sendo utilizada por outro aplicativo. Feche outros aplicativos e tente novamente.';
      }
      setCameraError(msg);
      setIsCameraActive(false);
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Toggle front/rear camera
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Start camera on mount when in 'CAMERA' view
  useEffect(() => {
    if (viewState === 'CAMERA') {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [viewState]);

  // Handle capture snapshot from live video
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      stopCamera();
      runIdentification(dataUrl);
    }
  };

  // Handle file picker selection
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      onShowToast(validation.error || 'Formato de imagem não suportado');
      e.target.value = '';
      return;
    }

    try {
      const dataUrl = await compressImage(file, 1200, 0.88);
      stopCamera();
      runIdentification(dataUrl);
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao processar imagem da galeria');
    } finally {
      e.target.value = '';
    }
  };

  // Run identification workflow
  const runIdentification = async (photoDataUrl: string) => {
    setCapturedPhotoUrl(photoDataUrl);
    setViewState('IDENTIFYING');
    setLoadingStep('Identificando planta...');
    setIdentificationError(null);
    setIsMenuOpen(false);

    try {
      const identifyRes = await fetch('/api/identify-plant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photoDataUrl,
          organ: selectedOrgan,
        }),
      });

      let identifyData: any = null;
      let rawText = '';
      try {
        rawText = await identifyRes.text();
        identifyData = JSON.parse(rawText);
      } catch {
        throw new Error(
          `O servidor retornou uma resposta não-JSON (Status HTTP ${identifyRes.status}): ${rawText.slice(0, 180) || 'Sem conteúdo'}`
        );
      }

      if (!identifyRes.ok) {
        throw new Error(identifyData?.error || 'Não foi possível identificar a planta com certeza.');
      }

      const result = identifyData as PlantNetIdentificationResponse;
      if (!result.candidates || result.candidates.length === 0) {
        throw new Error(
          result.message ||
            'A espécie não foi identificada com certeza. Tente novamente com uma foto mais nítida, com boa iluminação e foco direto na folha ou flor.'
        );
      }

      // Automatically select the best candidate (highest score)
      const top: PlantNetCandidate = result.candidates[0];
      const sci = top.scientificNameWithoutAuthor;
      const pop = top.commonNames && top.commonNames.length > 0 ? top.commonNames[0] : undefined;

      setLoadingStep('Buscando informações da espécie...');

      // Fetch care guide for the identified species
      let guide: SpeciesCareGuide | undefined;
      try {
        const careRes = await fetch('/api/species-care-guide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scientificName: sci,
            commonName: pop,
            family: top.family,
          }),
        });

        if (careRes.ok) {
          const careData = await careRes.json().catch(() => null);
          if (careData?.data) {
            guide = careData.data as SpeciesCareGuide;
          }
        }
      } catch (careErr) {
        console.warn('Erro secundário ao obter guia de cultivo:', careErr);
      }

      setIdentifiedResult({
        scientificName: sci,
        popularName: pop,
        family: top.family,
        scorePercentage: top.scorePercentage,
        careGuide: guide,
      });

      setViewState('RESULT');
    } catch (err: any) {
      setIdentificationError(err.message || 'Ocorreu um erro ao identificar a planta.');
      setViewState('ERROR');
    }
  };

  // Close Result and return to Camera
  const handleCloseResult = () => {
    setIsMenuOpen(false);
    setIdentifiedResult(null);
    setCapturedPhotoUrl(null);
    setIsSavedToWishList(false);
    setViewState('CAMERA');
  };

  // Action 1: Adicionar planta ao jardim
  const handleAddToGarden = () => {
    if (!identifiedResult || !capturedPhotoUrl) return;
    setIsMenuOpen(false);

    onAddToGarden({
      photoUrl: capturedPhotoUrl,
      species: identifiedResult.popularName
        ? `${identifiedResult.popularName} (${identifiedResult.scientificName})`
        : identifiedResult.scientificName,
      scientificName: identifiedResult.scientificName,
      popularName: identifiedResult.popularName,
      name: identifiedResult.popularName || identifiedResult.scientificName,
      careGuide: identifiedResult.careGuide,
    });
  };

  // Action 2: Adicionar à minha lista (Jardim Futuro)
  const handleAddToWishList = () => {
    if (!identifiedResult || !capturedPhotoUrl) return;
    setIsMenuOpen(false);

    const todayStr = new Date().toISOString().split('T')[0];
    onAddToWishList({
      id: `wish-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      scientificName: identifiedResult.scientificName,
      popularName: identifiedResult.popularName,
      photoUrl: capturedPhotoUrl,
      addedAt: todayStr,
      careGuide: identifiedResult.careGuide,
    });

    setIsSavedToWishList(true);
    onShowToast(`⭐ "${identifiedResult.popularName || identifiedResult.scientificName}" salva no Jardim Futuro!`);
  };

  // Action 3: Adicionar ao jardim vindo do diagnóstico de saúde
  const handleAddToGardenFromDiagnosis = (diagnosis: PlantDiagnosisResult) => {
    setIsDiagnosisModalOpen(false);
    onAddToGarden({
      species: diagnosis.plantSpecies || 'Espécie Sob Investigação',
      name: diagnosis.plantName || diagnosis.plantSpecies || 'Minha Planta em Tratamento',
      scientificName: diagnosis.plantSpecies,
      popularName: diagnosis.plantName,
    });
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto rounded-3xl overflow-hidden shadow-2xl bg-black text-white border border-[#5A5A40]/40">
      
      {/* Hidden file input for gallery fallback */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* ---------------------------------------------------- */}
      {/* VIEW 1: LIVE CAMERA VIEW                             */}
      {/* ---------------------------------------------------- */}
      {viewState === 'CAMERA' && (
        <div className="relative flex flex-col justify-between h-[75vh] min-h-[520px] max-h-[780px] bg-black">
          
          {/* Top Bar: Mode & Organ Pills */}
          <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-linear-to-b from-black/80 via-black/40 to-transparent flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5 drop-shadow-md">
                <Camera className="w-3.5 h-3.5" />
                Câmera Botânica
              </span>

              {/* Botão Diagnosticar Saúde Avulso */}
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setIsDiagnosisModalOpen(true);
                }}
                className="text-[11px] font-bold bg-[#D4AF37] hover:bg-[#c29e2f] text-[#2D3A2D] px-3 py-1 rounded-full border border-[#D4AF37] shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Stethoscope className="w-3.5 h-3.5" />
                Diagnosticar Saúde
              </button>
            </div>

            {/* Organ Selector Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {[
                { id: 'auto', label: 'Automático' },
                { id: 'leaf', label: 'Folha' },
                { id: 'flower', label: 'Flor' },
                { id: 'fruit', label: 'Fruto' },
                { id: 'bark', label: 'Caule' },
              ].map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => setSelectedOrgan(org.id)}
                  className={`text-[11px] px-3 py-1 rounded-full border font-medium transition-all backdrop-blur-md ${
                    selectedOrgan === org.id
                      ? 'bg-[#D4AF37] text-[#2D3A2D] border-[#D4AF37] font-bold shadow-md'
                      : 'bg-black/40 text-white/80 border-white/20 hover:bg-black/60'
                  }`}
                >
                  {org.label}
                </button>
              ))}
            </div>
          </div>

          {/* Central Live Video Stream */}
          <div className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center bg-black">
            {isCameraActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : null}

            {/* Viewfinder Target Framing Overlay */}
            {isCameraActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
                <div className="relative w-64 h-64 sm:w-80 sm:h-80 border-2 border-dashed border-[#D4AF37]/50 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                  {/* Framing Reticle Corners */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-3 border-l-3 border-[#D4AF37] rounded-tl-xl" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-3 border-r-3 border-[#D4AF37] rounded-tr-xl" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-3 border-l-3 border-[#D4AF37] rounded-bl-xl" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-3 border-r-3 border-[#D4AF37] rounded-br-xl" />

                  <span className="text-[11px] text-white/80 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/15 animate-pulse text-center">
                    Enquadre a planta aqui
                  </span>
                </div>
              </div>
            )}

            {/* Error or Permission Denied Fallback */}
            {cameraError && (
              <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-[#151c15] text-[#F5F5F0] space-y-4 z-10">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-[#D4AF37] flex items-center justify-center border border-[#D4AF37]/30 shadow-lg">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h4 className="font-serif text-lg font-bold text-[#F5F5F0]">
                    Acesso à Câmera
                  </h4>
                  <p className="text-xs text-white/70 leading-relaxed">
                    {cameraError}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-3 bg-[#D4AF37] hover:bg-[#c29e2f] text-[#2D3A2D] font-bold text-xs rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                  >
                    <ImageIcon className="w-4 h-4" />
                    Escolher Foto da Galeria
                  </button>

                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-2xl border border-white/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Tentar Novamente
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Controls Bar (Smartphone Camera Style) */}
          <div className="absolute bottom-0 left-0 right-0 z-20 p-6 bg-linear-to-t from-black/95 via-black/70 to-transparent flex items-center justify-around">
            
            {/* Gallery Shortcut (Bottom-Left) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 flex flex-col items-center justify-center transition-all active:scale-90 shadow-lg"
              title="Galeria de Fotos"
            >
              <ImageIcon className="w-5 h-5 text-white" />
              <span className="text-[8px] font-medium text-white/70 mt-0.5 leading-none">Galeria</span>
            </button>

            {/* Big Shutter Capture Button (Center-Bottom) */}
            <button
              type="button"
              onClick={handleCapturePhoto}
              disabled={!isCameraActive}
              className="group relative w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(255,255,255,0.3)] cursor-pointer"
              title="Tirar Foto"
            >
              <div className="w-16 h-16 rounded-full bg-white group-hover:bg-[#D4AF37] transition-colors shadow-inner" />
            </button>

            {/* Flip Camera Button (Bottom-Right) */}
            {hasMultipleCameras || isCameraActive ? (
              <button
                type="button"
                onClick={handleToggleFacingMode}
                className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 flex flex-col items-center justify-center transition-all active:scale-90 shadow-lg"
                title="Alternar Câmera Frontal / Traseira"
              >
                <FlipHorizontal className="w-5 h-5 text-white" />
                <span className="text-[8px] font-medium text-white/70 mt-0.5 leading-none">Inverter</span>
              </button>
            ) : (
              <div className="w-12 h-12" />
            )}

          </div>

        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* VIEW 2: IDENTIFYING SCANNING STATE                   */}
      {/* ---------------------------------------------------- */}
      {viewState === 'IDENTIFYING' && capturedPhotoUrl && (
        <div className="relative h-[75vh] min-h-[520px] max-h-[780px] bg-black flex flex-col items-center justify-center p-6 text-center space-y-6">
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden border-2 border-[#D4AF37]/60 shadow-[0_0_40px_rgba(212,175,55,0.25)]">
            <img
              src={capturedPhotoUrl}
              alt="Planta capturada"
              className="w-full h-full object-cover"
            />
            {/* Animated Laser Scanner Line */}
            <div className="absolute inset-x-0 h-1 bg-linear-to-r from-transparent via-[#D4AF37] to-transparent shadow-[0_0_15px_#D4AF37] animate-bounce" />
            <div className="absolute inset-0 bg-[#2D3A2D]/20 backdrop-blur-[1px]" />
          </div>

          <div className="space-y-2 max-w-sm">
            <div className="flex items-center justify-center gap-2 font-bold text-[#D4AF37] text-base">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>{loadingStep}</span>
            </div>
            <p className="text-xs text-white/70">
              Analisando os padrões botânicos e obtendo recomendações de cultivo...
            </p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* VIEW 3: ERROR / NO MATCH STATE                       */}
      {/* ---------------------------------------------------- */}
      {viewState === 'ERROR' && (
        <div className="relative h-[75vh] min-h-[520px] max-h-[780px] bg-[#1a221a] flex flex-col items-center justify-center p-6 text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/20 text-[#D4AF37] flex items-center justify-center border border-[#D4AF37]/40 shadow-xl">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2 max-w-md">
            <h4 className="font-serif text-xl font-bold text-[#F5F5F0]">
              Identificação Inconclusiva
            </h4>
            <p className="text-xs text-white/80 leading-relaxed">
              {identificationError || 'Não foi possível reconhecer a planta com precisão.'}
            </p>
            <p className="text-[11px] text-[#D4AF37]/90 pt-1">
              Dica: Aproxime a câmera da folha ou flor, garantindo boa iluminação natural e foco nítido.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setViewState('CAMERA');
                startCamera();
              }}
              className="px-6 py-3 bg-[#D4AF37] hover:bg-[#c29e2f] text-[#2D3A2D] font-bold text-xs rounded-2xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Tirar Outra Foto
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-2xl border border-white/20 transition-colors flex items-center justify-center gap-2"
            >
              <ImageIcon className="w-4 h-4" />
              Escolher da Galeria
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* VIEW 4: IDENTIFICATION RESULT SCREEN (Requirement 4) */}
      {/* ---------------------------------------------------- */}
      {viewState === 'RESULT' && identifiedResult && capturedPhotoUrl && (
        <div className="relative flex flex-col max-h-[85vh] bg-[#F5F5F0] text-[#2D3A2D] overflow-y-auto animate-fadeIn">
          
          {/* Top Bar with [+] on left and [X] on right */}
          <div className="sticky top-0 z-30 bg-[#2D3A2D] text-[#F5F5F0] px-5 py-3.5 flex items-center justify-between border-b border-[#5A5A40] shadow-md">
            
            {/* Top-Left: Button '+' opens compact menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="w-10 h-10 rounded-2xl bg-[#5A5A40]/80 hover:bg-[#5A5A40] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center shadow-md transition-all active:scale-95"
                title="Ações da planta"
              >
                <Plus className="w-5 h-5 text-[#D4AF37]" />
              </button>

              {/* Compact Menu with EXACTLY two actions */}
              {isMenuOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-[#2D3A2D] text-[#F5F5F0] rounded-2xl shadow-2xl border border-[#D4AF37]/50 py-1.5 z-50 animate-fadeIn overflow-hidden">
                  <button
                    type="button"
                    onClick={handleAddToGarden}
                    className="w-full px-4 py-3 text-left text-xs font-bold hover:bg-[#5A5A40]/50 flex items-center gap-2.5 transition-colors text-[#F5F5F0] cursor-pointer"
                  >
                    <Flower2 className="w-4 h-4 text-[#D4AF37]" />
                    <span>Adicionar planta ao jardim</span>
                  </button>

                  <div className="h-px bg-[#5A5A40]/50 my-1" />

                  <button
                    type="button"
                    onClick={handleAddToWishList}
                    className="w-full px-4 py-3 text-left text-xs font-bold hover:bg-[#5A5A40]/50 flex items-center gap-2.5 transition-colors text-[#F5F5F0] cursor-pointer"
                  >
                    {isSavedToWishList ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300">Salva no Jardim Futuro</span>
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-4 h-4 text-[#D4AF37]" />
                        <span>Adicionar à minha lista</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Header Title in Result Bar */}
            <div className="text-center">
              <span className="text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider block">
                Espécie Reconhecida
              </span>
              <span className="text-xs text-white/80">
                Resultado da identificação
              </span>
            </div>

            {/* Top-Right: Button 'X' closes screen and returns to Camera */}
            <button
              type="button"
              onClick={handleCloseResult}
              className="w-10 h-10 rounded-2xl bg-[#5A5A40]/80 hover:bg-[#5A5A40] text-white/80 hover:text-white border border-[#5A5A40] flex items-center justify-center shadow-md transition-all active:scale-95"
              title="Fechar resultado"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Content Area */}
          <div className="p-6 sm:p-8 space-y-6">
            
            {/* Photo & Species Banner */}
            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start bg-white p-5 rounded-3xl border border-[#5A5A40]/20 shadow-xs">
              <div className="relative w-36 h-36 rounded-2xl overflow-hidden border border-[#5A5A40]/30 shrink-0 shadow-md">
                <img
                  src={capturedPhotoUrl}
                  alt={identifiedResult.scientificName}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 text-center sm:text-left space-y-1.5">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Identificação concluída
                  </span>
                  {identifiedResult.scorePercentage && (
                    <span className="text-[11px] font-semibold bg-[#F5F5F0] text-[#5A5A40] px-2 py-0.5 rounded-full border border-[#5A5A40]/20">
                      {identifiedResult.scorePercentage}% compatibilidade
                    </span>
                  )}
                </div>

                {identifiedResult.popularName ? (
                  <>
                    <h3 className="font-serif text-2xl font-bold text-[#2D3A2D] capitalize">
                      {identifiedResult.popularName}
                    </h3>
                    <p className="font-serif text-sm italic text-[#5A5A40]">
                      {identifiedResult.scientificName}
                    </p>
                  </>
                ) : (
                  <h3 className="font-serif text-2xl font-bold text-[#2D3A2D] italic">
                    {identifiedResult.scientificName}
                  </h3>
                )}

                {identifiedResult.family && (
                  <p className="text-xs text-[#5A5A40]">
                    Família botânica: <strong>{identifiedResult.family}</strong>
                  </p>
                )}

                <p className="text-xs text-[#5A5A40] pt-2">
                  Toque no botão <strong>+</strong> no topo para adicionar ao jardim ou salvar na sua lista de desejos.
                </p>
              </div>
            </div>

            {/* Quick Care Recommendation Cards */}
            {identifiedResult.careGuide && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-[#2D3A2D] uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  Informações de Cultivo da Espécie
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Watering Card */}
                  <div className="bg-white p-4 rounded-2xl border border-[#5A5A40]/20 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-sky-900">
                        <Droplets className="w-4 h-4 text-sky-600" />
                        Rega & Umidade
                      </div>
                      <span className="text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                        {identifiedResult.careGuide.watering.wateringDaysRecommended
                          ? `A cada ${identifiedResult.careGuide.watering.wateringDaysRecommended} dias`
                          : identifiedResult.careGuide.watering.need}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#2D3A2D]">
                      {identifiedResult.careGuide.watering.frequency || 'Conforme a umidade do solo'}
                    </p>
                    <p className="text-[11px] text-[#5A5A40] leading-relaxed">
                      {identifiedResult.careGuide.watering.checkMethod || 'Verifique o solo antes de regar.'}
                    </p>
                  </div>

                  {/* Sunlight Card */}
                  <div className="bg-white p-4 rounded-2xl border border-[#5A5A40]/20 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                        <Sun className="w-4 h-4 text-amber-600" />
                        Iluminação Recomendada
                      </div>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        {identifiedResult.careGuide.lighting.type || 'Luz indireta'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#2D3A2D]">
                      {identifiedResult.careGuide.lighting.idealLocation || 'Próximo a uma janela bem iluminada'}
                    </p>
                    <p className="text-[11px] text-[#5A5A40] leading-relaxed">
                      {identifiedResult.careGuide.lighting.warning || 'Evite sol direto excessivo nas horas mais quentes.'}
                    </p>
                  </div>
                </div>

                {/* Toxicity Banner */}
                {identifiedResult.careGuide.toxicity && (
                  <div className={`p-3.5 rounded-2xl border flex items-start gap-3 shadow-2xs ${
                    identifiedResult.careGuide.toxicity.level === 'toxica'
                      ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                      : identifiedResult.careGuide.toxicity.level === 'moderadamente_toxica'
                      ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                      : identifiedResult.careGuide.toxicity.level === 'segura'
                      ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                      : 'bg-stone-50 border-stone-200 text-stone-900'
                  }`}>
                    <div className="shrink-0 mt-0.5">
                      {identifiedResult.careGuide.toxicity.level === 'segura' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                      ) : (
                        <AlertCircle className={`w-5 h-5 ${
                          identifiedResult.careGuide.toxicity.level === 'toxica' ? 'text-rose-700' : 'text-amber-700'
                        }`} />
                      )}
                    </div>
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold">Segurança e Toxicidade:</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          identifiedResult.careGuide.toxicity.level === 'toxica'
                            ? 'bg-rose-200/80 text-rose-900'
                            : identifiedResult.careGuide.toxicity.level === 'moderadamente_toxica'
                            ? 'bg-amber-200/80 text-amber-900'
                            : identifiedResult.careGuide.toxicity.level === 'segura'
                            ? 'bg-emerald-200/80 text-emerald-900'
                            : 'bg-stone-200 text-stone-800'
                        }`}>
                          {identifiedResult.careGuide.toxicity.level === 'toxica'
                            ? 'Tóxica'
                            : identifiedResult.careGuide.toxicity.level === 'moderadamente_toxica'
                            ? 'Moderadamente Tóxica'
                            : identifiedResult.careGuide.toxicity.level === 'segura'
                            ? 'Pet-Friendly (Segura)'
                            : 'Dados Insuficientes'}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed">
                        {identifiedResult.careGuide.toxicity.warningText}
                      </p>
                      {identifiedResult.careGuide.toxicity.principles && (
                        <p className="text-[11px] opacity-80 pt-0.5">
                          <strong>Princípios ativos:</strong> {identifiedResult.careGuide.toxicity.principles}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Collapsible Full Care Accordion */}
                <div className="pt-2">
                  <SpeciesCareAccordion
                    careGuide={identifiedResult.careGuide}
                    defaultOpen={true}
                  />
                </div>
              </div>
            )}

            {/* Bottom Floating Quick Actions */}
            <div className="pt-4 border-t border-[#5A5A40]/20 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCloseResult}
                className="px-4 py-2.5 rounded-2xl text-xs font-bold text-[#5A5A40] hover:bg-stone-200 transition-colors cursor-pointer"
              >
                Voltar à Câmera
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddToWishList}
                  disabled={isSavedToWishList}
                  className="px-4 py-2.5 bg-white hover:bg-[#F5F5F0] disabled:bg-emerald-50 text-[#2D3A2D] font-bold text-xs rounded-2xl border border-[#5A5A40]/30 shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:cursor-default"
                >
                  {isSavedToWishList ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-800">Salva no Jardim Futuro</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-4 h-4 text-[#A68069]" />
                      <span>Salvar na Minha Lista</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleAddToGarden}
                  className="px-5 py-2.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] font-bold text-xs rounded-2xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 border border-[#D4AF37]/50 cursor-pointer"
                >
                  <Flower2 className="w-4 h-4 text-[#D4AF37]" />
                  <span>Cadastrar no Jardim</span>
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Modal de Diagnóstico Fitossanitário Avulso */}
      <PlantDiagnosisModal
        isOpen={isDiagnosisModalOpen}
        onClose={() => {
          setIsDiagnosisModalOpen(false);
          startCamera();
        }}
        onAddToGardenFromDiagnosis={handleAddToGardenFromDiagnosis}
        onShowToast={onShowToast}
      />

    </div>
  );
};
