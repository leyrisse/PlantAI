import React, { useState, useEffect } from 'react';
import {
  Plant,
  CareTaskType,
  TimelineEvent,
  Tutor,
  Environment,
  PlantCollection,
  SpeciesCareGuide,
  PlantStructuredCare,
  CareSchedule,
  WishListItem,
  InitialPlantData,
  WeatherLocation,
  CurrentWeather,
  PlantDiagnosisResult,
} from './types';
import {
  INITIAL_PLANTS,
  INITIAL_ENVIRONMENTS,
  INITIAL_COLLECTIONS,
} from './data/mockData';
import { mapSunlightToLegacy, mapWaterNeedsLabel, getWateringDays } from './utils/careUtils';
import { getLocalTodayDateStr, calculateNextCareDate } from './utils/dateUtils';
import {
  getSavedWeatherLocation,
  saveWeatherLocation,
  getCachedWeather,
  fetchCurrentWeather,
  reverseGeocode,
} from './services/weatherService';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { useAuth } from './context/AuthContext';
import { HomeModule } from './components/HomeModule';
import { GardenModule } from './components/GardenModule';
import { DecisionAnalyzerModule } from './components/DecisionAnalyzerModule';
import { CareCalendarModule } from './components/CareCalendarModule';
import { CameraModule } from './components/CameraModule';
import { PlantProfileModal } from './components/PlantProfileModal';
import { NewPlantModal } from './components/NewPlantModal';
import { WeatherLocationModal } from './components/WeatherLocationModal';
import { WelcomeModal } from './components/WelcomeModal';
import { DeletePlantConfirmModal } from './components/DeletePlantConfirmModal';
import { SupabaseSqlModal } from './components/SupabaseSqlModal';
import {
  fetchUserPlants,
  createUserPlant,
  updateUserPlant,
  deleteUserPlant,
  loadLocalPlants,
  saveLocalPlants,
} from './services/plantService';
import { isSupabaseConfigured } from './services/supabaseClient';
import { AlertTriangle, Compass, MapPin, X, Database } from 'lucide-react';

const BASE_STORAGE_KEY_PLANTS = 'jardim_plants_v1';
const BASE_STORAGE_KEY_WISHLIST = 'jardim_wishlist_v1';
const STORAGE_KEY_WELCOME_DONE = 'plantai_welcome_completed_v1';
const STORAGE_KEY_LOCATION_DISMISSED = 'plantai_location_dismissed_v1';

function getStorageKey(baseKey: string, userId?: string | null): string {
  if (userId) {
    return `${baseKey}_${userId}`;
  }
  return baseKey;
}

/**
 * Loads plants from localStorage.
 * For new visitors, starts with an EMPTY garden ([]).
 * If existing user data is found in user-scoped or legacy key, preserves it defensively.
 */
function loadSavedPlants(userId?: string | null): Plant[] {
  try {
    const userKey = getStorageKey(BASE_STORAGE_KEY_PLANTS, userId);
    const saved = localStorage.getItem(userKey);

    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map((p: any) => ({
          ...p,
          careSchedule: {
            waterFrequencyDays: Number(p.careSchedule?.waterFrequencyDays) || 7,
            fertilizeFrequencyDays: Number(p.careSchedule?.fertilizeFrequencyDays) || 30,
            pruneFrequencyDays: Number(p.careSchedule?.pruneFrequencyDays) || 90,
            lastWatered: p.careSchedule?.lastWatered || undefined,
            lastFertilized: p.careSchedule?.lastFertilized || undefined,
            lastPruned: p.careSchedule?.lastPruned || undefined,
          },
          timeline: Array.isArray(p.timeline) ? p.timeline : [],
          tutors: Array.isArray(p.tutors) ? p.tutors : [],
        }));
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar plantas salvas do localStorage:', e);
  }
  // New visitors start with an EMPTY garden ([]), never with mockData as silent default!
  return [];
}

/**
 * Loads wishlist items from localStorage.
 * Returns empty array for new visitors.
 */
function loadSavedWishList(userId?: string | null): WishListItem[] {
  try {
    const userKey = getStorageKey(BASE_STORAGE_KEY_WISHLIST, userId);
    let saved = localStorage.getItem(userKey);

    if (!saved && userId) {
      const legacySaved = localStorage.getItem(BASE_STORAGE_KEY_WISHLIST);
      if (legacySaved) {
        saved = legacySaved;
        try {
          localStorage.setItem(userKey, legacySaved);
        } catch {
          // Ignore write error
        }
      }
    }

    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Erro ao carregar lista de desejos do localStorage:', e);
  }
  return [];
}

export default function App() {
  const auth = useAuth();

  // Welcome modal: shown only on first access
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_WELCOME_DONE) !== 'true';
    } catch {
      return false;
    }
  });

  // Default tab: CAMERA if welcome was already completed, otherwise CAMERA on visitor start
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY_WELCOME_DONE) === 'true';
      return done ? 'CAMERA' : 'HOME';
    } catch {
      return 'CAMERA';
    }
  });

  // Plant collection state with localStorage persistence scoped by visitor identity
  const [plants, setPlants] = useState<Plant[]>(() => loadLocalPlants(auth.userId));
  const [isLoadingPlants, setIsLoadingPlants] = useState(false);
  const [isTableMissing, setIsTableMissing] = useState(false);
  const [dbNotice, setDbNotice] = useState<string | null>(null);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);

  // Deletion state
  const [plantToDelete, setPlantToDelete] = useState<Plant | null>(null);
  const [isDeletingPlant, setIsDeletingPlant] = useState(false);

  // Wishlist state with localStorage persistence scoped by visitor identity
  const [wishList, setWishList] = useState<WishListItem[]>(() => loadSavedWishList(auth.userId));

  // Load plants from Supabase on mount or when user session is established
  useEffect(() => {
    let isCancelled = false;

    async function syncGardenFromSupabase() {
      if (!auth.userId) return;
      setIsLoadingPlants(true);
      try {
        const result = await fetchUserPlants(auth.userId);
        if (isCancelled) return;

        if (result.isTableMissing) {
          setIsTableMissing(true);
          setDbNotice('Tabela "plants" pendente no Supabase. O PlantAI está armazenando suas plantas localmente.');
          const local = loadLocalPlants(auth.userId);
          if (local.length > 0 && plants.length === 0) {
            setPlants(local);
          }
        } else if (result.error) {
          setDbNotice(result.error);
          const local = loadLocalPlants(auth.userId);
          if (local.length > 0 && plants.length === 0) {
            setPlants(local);
          }
        } else if (result.fromSupabase) {
          setIsTableMissing(false);
          setDbNotice(null);
          setPlants(result.data);
          saveLocalPlants(result.data, auth.userId);
        }
      } catch (err) {
        console.warn('Erro ao sincronizar jardim com Supabase:', err);
      } finally {
        if (!isCancelled) setIsLoadingPlants(false);
      }
    }

    syncGardenFromSupabase();

    if (auth.userId) {
      const userWishlist = loadSavedWishList(auth.userId);
      if (userWishlist.length > 0 && wishList.length === 0) {
        setWishList(userWishlist);
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [auth.userId]);

  // Persist plants to scoped localStorage
  useEffect(() => {
    saveLocalPlants(plants, auth.userId);
  }, [plants, auth.userId]);

  // Persist wishlist to scoped localStorage
  useEffect(() => {
    try {
      const userKey = getStorageKey(BASE_STORAGE_KEY_WISHLIST, auth.userId);
      localStorage.setItem(userKey, JSON.stringify(wishList));
    } catch (e) {
      console.warn('Erro ao salvar lista de desejos no localStorage:', e);
    }
  }, [wishList, auth.userId]);

  const [environments, setEnvironments] = useState<Environment[]>(INITIAL_ENVIRONMENTS);
  const [collections, setCollections] = useState<PlantCollection[]>(INITIAL_COLLECTIONS);

  // Weather & garden location state
  const [weatherLocation, setWeatherLocation] = useState<WeatherLocation | null>(getSavedWeatherLocation);
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(getCachedWeather);
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);
  const [isRefreshingWeather, setIsRefreshingWeather] = useState(false);

  // Gentle location setup prompt (non-blocking, explicit user action only)
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  // Fetch weather on mount if a location is saved, or when location changes
  useEffect(() => {
    if (weatherLocation) {
      setIsRefreshingWeather(true);
      fetchCurrentWeather(weatherLocation.latitude, weatherLocation.longitude)
        .then((data) => {
          setCurrentWeather(data);
        })
        .catch((err) => {
          console.warn('Erro ao atualizar clima do jardim:', err);
        })
        .finally(() => {
          setIsRefreshingWeather(false);
        });
    }
  }, [weatherLocation?.latitude, weatherLocation?.longitude]);

  const handleRefreshWeather = async () => {
    if (!weatherLocation) return;
    setIsRefreshingWeather(true);
    try {
      const data = await fetchCurrentWeather(weatherLocation.latitude, weatherLocation.longitude);
      setCurrentWeather(data);
      showToast(`🌤️ Clima atualizado: ${data.temperature}°C em ${weatherLocation.name.split(',')[0]}`);
    } catch {
      showToast(`⚠️ Não foi possível atualizar os dados meteorológicos.`);
    } finally {
      setIsRefreshingWeather(false);
    }
  };

  const handleWeatherLocationSaved = (newLocation: WeatherLocation, newWeather: CurrentWeather) => {
    setWeatherLocation(newLocation);
    setCurrentWeather(newWeather);
    setShowLocationPrompt(false);
    showToast(`📍 Localização definida: ${newLocation.name.split(',')[0]} (${newWeather.temperature}°C)`);
  };

  const handleWeatherLocationRemoved = () => {
    setWeatherLocation(null);
    setCurrentWeather(null);
    showToast(`Localização do jardim removida.`);
  };

  // Explicit device location request handler
  const handleRequestDeviceLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocalização não suportada pelo navegador. Informe a cidade manualmente.');
      setIsWeatherModalOpen(true);
      setShowLocationPrompt(false);
      return;
    }

    setIsRequestingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const placeName = await reverseGeocode(lat, lon);
          const weather = await fetchCurrentWeather(lat, lon);
          const newLoc: WeatherLocation = {
            latitude: lat,
            longitude: lon,
            name: placeName,
            type: 'current',
            savedAt: new Date().toISOString(),
          };
          saveWeatherLocation(newLoc);
          setWeatherLocation(newLoc);
          setCurrentWeather(weather);
          setShowLocationPrompt(false);
          showToast(`📍 Localização definida: ${placeName.split(',')[0]} (${weather.temperature}°C)`);
        } catch (err: any) {
          showToast(err?.message || 'Não foi possível obter os dados meteorológicos para as coordenadas.');
        } finally {
          setIsRequestingLocation(false);
        }
      },
      (err) => {
        setIsRequestingLocation(false);
        setShowLocationPrompt(false);
        if (err.code === err.PERMISSION_DENIED) {
          showToast('Permissão de localização não concedida. Você pode informar sua cidade manualmente.');
          setIsWeatherModalOpen(true);
        } else {
          showToast('Não foi possível obter a localização do dispositivo.');
        }
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  const handleDismissLocationPrompt = () => {
    try {
      localStorage.setItem(STORAGE_KEY_LOCATION_DISMISSED, 'true');
    } catch {
      // ignore
    }
    setShowLocationPrompt(false);
  };

  // Welcome modal dismissal and visitor start
  const handleStartAsVisitor = () => {
    try {
      localStorage.setItem(STORAGE_KEY_WELCOME_DONE, 'true');
    } catch (e) {
      console.warn('Erro ao salvar status de boas-vindas:', e);
    }
    setIsWelcomeModalOpen(false);
    setActiveTab('CAMERA');

    // Prompt for location if not configured and not previously dismissed
    if (!weatherLocation) {
      try {
        if (localStorage.getItem(STORAGE_KEY_LOCATION_DISMISSED) !== 'true') {
          setShowLocationPrompt(true);
        }
      } catch {
        setShowLocationPrompt(true);
      }
    }
  };

  // Explicit demo mode: loads mock plants only when explicitly requested
  const handleLoadDemoPlants = () => {
    setPlants(INITIAL_PLANTS);
    saveLocalPlants(INITIAL_PLANTS, auth.userId);
    showToast('🌱 Plantas de demonstração carregadas com sucesso no seu jardim!');
  };

  // Store ID of the selected plant so that modal always reflects the latest plant state
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const selectedPlant = plants.find((p) => p.id === selectedPlantId) || null;

  const [isNewPlantModalOpen, setIsNewPlantModalOpen] = useState(false);
  const [pendingPlantInitialData, setPendingPlantInitialData] = useState<InitialPlantData | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  /**
   * Logs a care task (Water, Fertilize, Prune, Repot) using the user's real local calendar date.
   */
  const handleLogCareTask = (plantId: string, taskType: CareTaskType) => {
    const today = getLocalTodayDateStr();

    let targetPlantName = '';
    let taskNameFormatted = '';
    let updatedPlantForDb: Plant | null = null;

    setPlants((prev) =>
      prev.map((p) => {
        if (p.id !== plantId) return p;

        targetPlantName = p.name;
        const updatedSchedule: CareSchedule = {
          waterFrequencyDays: p.careSchedule?.waterFrequencyDays || 7,
          fertilizeFrequencyDays: p.careSchedule?.fertilizeFrequencyDays || 30,
          pruneFrequencyDays: p.careSchedule?.pruneFrequencyDays || 90,
          lastWatered: p.careSchedule?.lastWatered,
          lastFertilized: p.careSchedule?.lastFertilized,
          lastPruned: p.careSchedule?.lastPruned,
        };

        if (taskType === 'WATER') {
          updatedSchedule.lastWatered = today;
          taskNameFormatted = 'Rega';
        } else if (taskType === 'FERTILIZE') {
          updatedSchedule.lastFertilized = today;
          taskNameFormatted = 'Adubação';
        } else if (taskType === 'PRUNE') {
          updatedSchedule.lastPruned = today;
          taskNameFormatted = 'Poda de Manutenção';
        }

        const newLogEvent: TimelineEvent = {
          id: `care-log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          date: today,
          type: taskType,
          title: `Cuidado Realizado: ${taskNameFormatted}`,
          description: `Registro efetuado em ${today.split('-').reverse().join('/')}. Próximo ciclo recalculado automaticamente.`,
          authorName: 'Guardião Atual',
          authorRole: 'Tutor',
        };

        const updatedPlant: Plant = {
          ...p,
          careSchedule: updatedSchedule,
          timeline: [newLogEvent, ...p.timeline],
        };
        updatedPlantForDb = updatedPlant;
        return updatedPlant;
      })
    );

    if (taskNameFormatted) {
      showToast(`🌿 ${taskNameFormatted} registrada para ${targetPlantName || 'a planta'}!`);
    }

    // Persist to Supabase with the freshly updated plant object (never stale state)
    if (updatedPlantForDb && auth.userId) {
      updateUserPlant(updatedPlantForDb, auth.userId).catch((err) => {
        console.warn('[PlantAI / Supabase] Erro ao sincronizar cuidado:', err?.message || err);
      });
    }
  };

  const handleUpdatePlantCareGuide = (plantId: string, newGuide: SpeciesCareGuide) => {
    setPlants((prev) => {
      const next = prev.map((p) => (p.id === plantId ? { ...p, careGuide: newGuide } : p));
      const target = next.find((p) => p.id === plantId);
      if (target && auth.userId) updateUserPlant(target, auth.userId).catch(() => {});
      return next;
    });
  };

  const handleUpdatePlantCare = (plantId: string, updatedCare: PlantStructuredCare) => {
    setPlants((prev) => {
      const next = prev.map((p) => {
        if (p.id !== plantId) return p;
        const legacySunlight = mapSunlightToLegacy(updatedCare.sunlightType);
        const waterDays = getWateringDays(updatedCare.wateringFrequency, updatedCare.customWateringDays);
        const legacyWaterNeeds = mapWaterNeedsLabel(waterDays);
        return {
          ...p,
          structuredCare: updatedCare,
          sunlightNeeds: legacySunlight,
          waterNeeds: legacyWaterNeeds,
        };
      });
      const target = next.find((p) => p.id === plantId);
      if (target && auth.userId) updateUserPlant(target, auth.userId).catch(() => {});
      return next;
    });
  };

  const handleAddTimelineEvent = (plantId: string, event: Omit<TimelineEvent, 'id'>) => {
    const newEvent: TimelineEvent = {
      ...event,
      id: `evt-${Date.now()}`,
    };
    setPlants((prev) => {
      const next = prev.map((p) => (p.id === plantId ? { ...p, timeline: [newEvent, ...p.timeline] } : p));
      const target = next.find((p) => p.id === plantId);
      if (target && auth.userId) updateUserPlant(target, auth.userId).catch(() => {});
      return next;
    });
  };

  const handleSaveDiagnosis = async (
    plantId: string,
    diagnosis: PlantDiagnosisResult,
    newStatus?: Plant['status']
  ): Promise<{ savedInSupabase: boolean }> => {
    const today = getLocalTodayDateStr();
    const newEvent: TimelineEvent = {
      id: `diag-evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      date: today,
      type: 'DIAGNOSIS',
      title: `Diagnóstico: ${diagnosis.hypotheses[0]?.causeName || 'Avaliação Fitossanitária'}`,
      description: `${diagnosis.conditionSummary}\n\nAções imediatas recomendadas:\n${diagnosis.actionPlan.immediateSteps.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      authorName: 'Médico Botânico (IA)',
      authorRole: 'Diagnóstico Fitossanitário',
      diagnosisData: diagnosis,
    };

    // 1. Atualizar o estado da interface sem efeitos colaterais de rede no callback
    let updatedPlant: Plant | null = null;
    let nextPlants: Plant[] = [];

    setPlants((prev) => {
      nextPlants = prev.map((p) => {
        if (p.id !== plantId) return p;
        updatedPlant = {
          ...p,
          status: newStatus ? newStatus : p.status,
          timeline: [newEvent, ...(p.timeline || [])],
        };
        return updatedPlant;
      });
      return nextPlants;
    });

    if (!updatedPlant) {
      return { savedInSupabase: false };
    }

    // 2. Garantir persistência imediata no armazenamento local (offline-first)
    saveLocalPlants(nextPlants, auth.userId);

    // 3. Operação de rede isolada fora do setPlants: aguarda a Promise real do Supabase.
    // NOTA DE CONCORRÊNCIA: O Supabase persiste o array timeline na coluna JSONB (Last-Write-Wins).
    // Atualizações concorrentes em diferentes dispositivos/abas aplicam a última escrita recebida.
    let isSavedInDb = false;
    if (isSupabaseConfigured() && auth.userId) {
      try {
        const res = await updateUserPlant(updatedPlant, auth.userId);
        isSavedInDb = Boolean(res?.savedInSupabase);
      } catch (err) {
        console.warn('Falha na comunicação com Supabase; diagnóstico mantido no dispositivo:', err);
        isSavedInDb = false;
      }
    }

    return { savedInSupabase: isSavedInDb };
  };

  const handleAddTutor = (plantId: string, tutor: Omit<Tutor, 'id' | 'joinedDate'>) => {
    const newTutor: Tutor = {
      ...tutor,
      id: `tutor-${Date.now()}`,
      joinedDate: getLocalTodayDateStr(),
    };
    setPlants((prev) => {
      const next = prev.map((p) => (p.id === plantId ? { ...p, tutors: [...p.tutors, newTutor] } : p));
      const target = next.find((p) => p.id === plantId);
      if (target && auth.userId) updateUserPlant(target, auth.userId).catch(() => {});
      return next;
    });
  };

  const handleTransferOwnership = (plantId: string, newOwnerName: string, reason: string) => {
    const transferEvent: TimelineEvent = {
      id: `transfer-${Date.now()}`,
      date: getLocalTodayDateStr(),
      type: 'TRANSFER',
      title: 'Guardião Principal Atualizado',
      description: `Tutoria principal formalizada para ${newOwnerName}. Motivo: ${reason}`,
      authorName: 'PlantAI',
      authorRole: 'Sistema de Registro Digital',
    };

    setPlants((prev) => {
      const next = prev.map((p) => {
        if (p.id !== plantId) return p;
        return {
          ...p,
          status: 'HEALTHY',
          timeline: [transferEvent, ...p.timeline],
        };
      });
      const target = next.find((p) => p.id === plantId);
      if (target && auth.userId) updateUserPlant(target, auth.userId).catch(() => {});
      return next;
    });
  };

  const handleSaveNewPlant = async (newPlant: Plant) => {
    // Prevent duplicate entries
    if (plants.some((p) => p.id === newPlant.id || p.rgDigital === newPlant.rgDigital)) {
      showToast(`ℹ️ "${newPlant.name}" já está cadastrada no seu jardim.`);
      setIsNewPlantModalOpen(false);
      setPendingPlantInitialData(null);
      setActiveTab('GARDEN');
      return;
    }

    try {
      const result = await createUserPlant(newPlant, auth.userId);
      if (!result.success) {
        showToast(`❌ ${result.error || 'Erro ao registrar planta no banco.'}`);
        return;
      }

      const plantToKeep = result.data || newPlant;
      setPlants((prev) => {
        if (prev.some((p) => p.id === plantToKeep.id || p.rgDigital === plantToKeep.rgDigital)) {
          return prev;
        }
        const updated = [plantToKeep, ...prev];
        saveLocalPlants(updated, auth.userId);
        return updated;
      });

      setIsNewPlantModalOpen(false);
      setPendingPlantInitialData(null);
      setActiveTab('GARDEN');

      if (result.savedInSupabase) {
        showToast(`🌿 "${plantToKeep.name}" adicionada ao jardim e sincronizada no Supabase!`);
      } else if (result.isTableMissing) {
        setIsTableMissing(true);
        showToast(`🌿 "${plantToKeep.name}" adicionada ao jardim (armazenada localmente — tabela "plants" pendente no Supabase).`);
      } else if (result.error) {
        showToast(`🌿 "${plantToKeep.name}" adicionada ao jardim (armazenada localmente — ${result.error}).`);
      } else {
        showToast(`🌿 "${plantToKeep.name}" adicionada ao jardim (armazenada localmente).`);
      }
    } catch (err: any) {
      showToast(`❌ Falha ao adicionar planta: ${err?.message || err}`);
    }
  };

  // Plant deletion handlers
  const handlePromptDeletePlant = (plantId: string) => {
    const target = plants.find((p) => p.id === plantId);
    if (target) {
      setPlantToDelete(target);
    }
  };

  const handleConfirmDeletePlant = async () => {
    if (!plantToDelete) return;
    setIsDeletingPlant(true);
    const targetId = plantToDelete.id;
    const targetName = plantToDelete.name;

    try {
      const result = await deleteUserPlant(targetId, auth.userId);
      setIsDeletingPlant(false);

      if (!result.success) {
        showToast(`❌ ${result.error || 'Não foi possível excluir a planta do banco.'}`);
        return;
      }

      setPlants((prev) => {
        const remaining = prev.filter((p) => p.id !== targetId);
        saveLocalPlants(remaining, auth.userId);
        return remaining;
      });

      if (selectedPlantId === targetId) {
        setSelectedPlantId(null);
      }

      setPlantToDelete(null);
      showToast(`🌱 Planta "${targetName}" excluída do jardim com sucesso.`);

      if (result.isTableMissing) {
        setIsTableMissing(true);
      }
    } catch (err: any) {
      setIsDeletingPlant(false);
      showToast(`❌ Falha na exclusão da planta: ${err?.message || err}`);
    }
  };

  const handleAddDecisionToTimeline = (plantId: string, title: string, rationale: string, actionSteps: string[]) => {
    const decisionEvent: TimelineEvent = {
      id: `decision-${Date.now()}`,
      date: getLocalTodayDateStr(),
      type: 'NOTE',
      title: `Decisão de Cultivo: ${title}`,
      description: `${rationale}\n\nPassos Recomendados:\n${actionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      authorName: 'Assistente Botânico (IA)',
      authorRole: 'Consultor Botânico',
    };

    setPlants((prev) =>
      prev.map((p) => (p.id === plantId ? { ...p, timeline: [decisionEvent, ...p.timeline] } : p))
    );
    showToast('Decisão registrada no histórico da planta!');
  };

  const handleAddToWishList = (item: WishListItem) => {
    const today = getLocalTodayDateStr();
    const fullItem: WishListItem = {
      id: item.id || `wish-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      scientificName: item.scientificName,
      popularName: item.popularName,
      photoUrl: item.photoUrl,
      addedAt: item.addedAt || today,
      careGuide: item.careGuide,
      notes: item.notes,
    };

    setWishList((prev) => {
      const exists = prev.some(
        (w) => w.scientificName.toLowerCase() === fullItem.scientificName.toLowerCase()
      );
      if (exists) {
        showToast(`ℹ️ "${fullItem.popularName || fullItem.scientificName}" já está salva no seu Jardim Futuro!`);
        return prev;
      }
      const updated = [fullItem, ...prev];
      try {
        const userKey = getStorageKey(BASE_STORAGE_KEY_WISHLIST, auth.userId);
        localStorage.setItem(userKey, JSON.stringify(updated));
      } catch (e) {
        console.warn('Erro ao salvar lista de desejos:', e);
      }
      showToast(`⭐ "${fullItem.popularName || fullItem.scientificName}" adicionada à sua lista de desejos!`);
      return updated;
    });
  };

  const handleRemoveFromWishList = (id: string) => {
    setWishList((prev) => prev.filter((item) => item.id !== id));
    showToast('Planta removida do Jardim Futuro.');
  };

  const handleOpenGardenFromIdentified = (initialData: InitialPlantData) => {
    setPendingPlantInitialData(initialData);
    setIsNewPlantModalOpen(true);
  };

  // Overdue count calculation
  const overdueTasksCount = plants.reduce((count, p) => {
    const nextWater = calculateNextCareDate(p.careSchedule?.lastWatered, p.careSchedule?.waterFrequencyDays || 7);
    const nextFertilize = calculateNextCareDate(p.careSchedule?.lastFertilized, p.careSchedule?.fertilizeFrequencyDays || 30);
    let c = count;
    if (nextWater.isOverdue) c++;
    if (nextFertilize.isOverdue) c++;
    return c;
  }, 0);

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#2D3A2D] flex flex-col font-sans selection:bg-[#D4AF37] selection:text-[#2D3A2D]">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#2D3A2D] text-[#F5F5F0] px-4 py-3 rounded-2xl shadow-xl border border-[#D4AF37]/40 text-xs font-semibold animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* Top Header */}
      <Header
        onOpenNewPlantModal={() => {
          setPendingPlantInitialData(null);
          setIsNewPlantModalOpen(true);
        }}
        onOpenWelcomeModal={() => setIsWelcomeModalOpen(true)}
        onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
        weatherLocation={weatherLocation}
        currentWeather={currentWeather}
        userId={auth.userId}
        isAnonymous={auth.isAnonymous}
      />

      {/* Main Body Module Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
        
        {/* Supabase Auth Diagnostic Banner (If misconfigured, e.g. Vercel domain in URL) */}
        {auth.error && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-2xl shadow-xs mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950">Aviso do Supabase Auth</p>
                <p className="text-amber-800 mt-0.5 leading-relaxed">{auth.error}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => auth.retryAuth()}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors cursor-pointer"
              >
                Tentar Novamente
              </button>
              <button
                type="button"
                onClick={() => auth.dismissError()}
                className="px-2.5 py-1.5 text-amber-800 hover:text-amber-950 font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* Supabase Database Schema Notice Banner (when table is not created yet) */}
        {isTableMissing && (
          <div className="bg-emerald-50 border-l-4 border-emerald-600 p-4 rounded-2xl shadow-xs mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-950 animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <Database className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-950">Sincronização em Nuvem (Supabase)</p>
                <p className="text-emerald-800 mt-0.5 leading-relaxed">
                  A autenticação do visitante está ativa. Suas plantas estão salvas no armazenamento local deste navegador até que a tabela <code className="font-mono font-bold bg-emerald-100 px-1 py-0.5 rounded">plants</code> seja criada no Supabase.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setIsSqlModalOpen(true)}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Ver Script SQL</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTableMissing(false)}
                className="px-2.5 py-1.5 text-emerald-800 hover:text-emerald-950 font-semibold cursor-pointer"
              >
                Dispensar
              </button>
            </div>
          </div>
        )}

        {/* Gentle Location Setup Prompt (Non-blocking, explicit user choice) */}
        {showLocationPrompt && !weatherLocation && (
          <div className="bg-[#F5F5F0] border border-[#5A5A40]/30 rounded-2xl p-4 sm:p-5 shadow-xs mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#2D3A2D] text-[#D4AF37] flex items-center justify-center shrink-0 shadow-xs">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <div>
                <h4 className="font-serif text-sm font-bold text-[#2D3A2D]">
                  Deseja ativar a previsão do tempo para as suas plantas?
                </h4>
                <p className="text-xs text-[#5A5A40] mt-0.5">
                  A temperatura e o clima ajudam a calcular a necessidade real de rega e insolação.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
              <button
                type="button"
                onClick={handleRequestDeviceLocation}
                disabled={isRequestingLocation}
                className="px-3.5 py-1.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Compass className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{isRequestingLocation ? 'Obtendo...' : 'Usar Minha Localização'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLocationPrompt(false);
                  setIsWeatherModalOpen(true);
                }}
                className="px-3 py-1.5 bg-white hover:bg-stone-50 text-[#2D3A2D] text-xs font-semibold rounded-xl border border-[#5A5A40]/20 transition-colors cursor-pointer"
              >
                Buscar Cidade
              </button>
              <button
                type="button"
                onClick={handleDismissLocationPrompt}
                className="p-1.5 text-[#5A5A40] hover:text-[#2D3A2D] rounded-lg transition-colors cursor-pointer"
                title="Dispensar aviso de localização"
                aria-label="Dispensar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'HOME' && (
          <HomeModule
            plants={plants}
            onLogCareTask={handleLogCareTask}
            onSelectPlant={(plant) => setSelectedPlantId(plant.id)}
            onNavigateToCare={() => setActiveTab('CARE')}
            location={weatherLocation}
            weather={currentWeather}
            isLoadingWeather={isRefreshingWeather}
            onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
          />
        )}

        {activeTab === 'GARDEN' && (
          <GardenModule
            plants={plants}
            environments={environments}
            collections={collections}
            onSelectPlant={(plant) => setSelectedPlantId(plant.id)}
            onOpenNewPlantModal={() => {
              setPendingPlantInitialData(null);
              setIsNewPlantModalOpen(true);
            }}
            wishList={wishList}
            onRemoveWishListItem={handleRemoveFromWishList}
            onAddToGarden={handleOpenGardenFromIdentified}
            onNavigateToCamera={() => setActiveTab('CAMERA')}
            onLoadDemoPlants={handleLoadDemoPlants}
            currentTemperature={currentWeather?.temperature ?? null}
            onDeletePlant={handlePromptDeletePlant}
          />
        )}

        {activeTab === 'CAMERA' && (
          <CameraModule
            onAddToGarden={handleOpenGardenFromIdentified}
            onAddToWishList={handleAddToWishList}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'CARE' && (
          <CareCalendarModule
            plants={plants}
            onLogCareTask={handleLogCareTask}
            onSelectPlant={(plant) => setSelectedPlantId(plant.id)}
          />
        )}

        {activeTab === 'DECISION_AI' && (
          <DecisionAnalyzerModule
            plants={plants}
            onAddDecisionToTimeline={handleAddDecisionToTimeline}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="bg-[#2D3A2D] text-[#F5F5F0]/80 py-8 pb-28 border-t border-[#5A5A40]/40 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[#F5F5F0]">
            <span className="font-serif font-bold text-[#D4AF37] text-sm">PlantAI</span>
            <span>• Ecossistema de Identificação Botânica & Cuidados</span>
          </div>
          <div className="flex items-center gap-4 text-[#F5F5F0]/70">
            <button
              type="button"
              onClick={() => setIsWelcomeModalOpen(true)}
              className="hover:text-[#D4AF37] transition-colors underline cursor-pointer"
            >
              Sobre o PlantAI
            </button>
            <span>•</span>
            <p>© 2026 PlantAI. Preservando histórias e conexões afetivas com as plantas.</p>
          </div>
        </div>
      </footer>

      {/* Primary Module Bottom Navigation Bar */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        overdueTasksCount={overdueTasksCount}
      />

      {/* Welcome Modal for First Access or via Help button */}
      <WelcomeModal
        isOpen={isWelcomeModalOpen}
        onClose={() => setIsWelcomeModalOpen(false)}
        onStartAsVisitor={handleStartAsVisitor}
        isFirstAccess={!localStorage.getItem(STORAGE_KEY_WELCOME_DONE)}
      />

      {/* Plant Profile Modal */}
      {selectedPlant && (
        <PlantProfileModal
          plant={selectedPlant}
          onClose={() => setSelectedPlantId(null)}
          onAddTimelineEvent={handleAddTimelineEvent}
          onAddTutor={handleAddTutor}
          onTransferOwnership={handleTransferOwnership}
          onLogCareTask={handleLogCareTask}
          onUpdatePlantCareGuide={handleUpdatePlantCareGuide}
          onUpdatePlantCare={handleUpdatePlantCare}
          onDeletePlant={handlePromptDeletePlant}
          onSaveDiagnosis={handleSaveDiagnosis}
          onShowToast={showToast}
        />
      )}

      {/* Delete Plant Confirmation Modal */}
      <DeletePlantConfirmModal
        isOpen={Boolean(plantToDelete)}
        plant={plantToDelete}
        isDeleting={isDeletingPlant}
        onClose={() => setPlantToDelete(null)}
        onConfirm={handleConfirmDeletePlant}
      />

      {/* Supabase SQL Instructions Modal */}
      <SupabaseSqlModal
        isOpen={isSqlModalOpen}
        onClose={() => setIsSqlModalOpen(false)}
      />

      {/* New Plant Modal */}
      {isNewPlantModalOpen && (
        <NewPlantModal
          isOpen={isNewPlantModalOpen}
          initialData={pendingPlantInitialData || undefined}
          environments={environments}
          collections={collections}
          onClose={() => {
            setIsNewPlantModalOpen(false);
            setPendingPlantInitialData(null);
          }}
          onSavePlant={(newPlant) => {
            handleSaveNewPlant(newPlant);
            setPendingPlantInitialData(null);
          }}
          onSave={(newPlant) => {
            handleSaveNewPlant(newPlant);
            setPendingPlantInitialData(null);
          }}
        />
      )}

      {/* Weather & Location Modal */}
      <WeatherLocationModal
        isOpen={isWeatherModalOpen}
        location={weatherLocation}
        weather={currentWeather}
        onClose={() => setIsWeatherModalOpen(false)}
        onLocationSaved={handleWeatherLocationSaved}
        onLocationRemoved={handleWeatherLocationRemoved}
        onRefreshWeather={handleRefreshWeather}
        isRefreshingWeather={isRefreshingWeather}
      />

    </div>
  );
}
