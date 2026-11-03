export type CareTaskType = 'WATER' | 'FERTILIZE' | 'PRUNE' | 'REPOT' | 'SUNLIGHT' | 'NOTE';

export interface CareSchedule {
  waterFrequencyDays: number;
  fertilizeFrequencyDays: number;
  pruneFrequencyDays: number;
  lastWatered: string; // YYYY-MM-DD
  lastFertilized: string;
  lastPruned?: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  type: CareTaskType | 'BLOOM' | 'TRANSFER' | 'ADOPTION' | 'MILESTONE';
  title: string;
  description: string;
  authorName: string;
  authorRole?: string;
  photoUrl?: string;
}

export interface Tutor {
  id: string;
  name: string;
  role: 'Tutor Principal' | 'Guardião de Fim de Semana' | 'Consultor Agrônomo' | 'Co-tutor';
  avatar: string;
  joinedDate: string;
}

export type WateringFrequencyPreset =
  | 'diariamente'
  | 'a_cada_2_dias'
  | 'a_cada_3_dias'
  | 'semanalmente'
  | 'a_cada_15_dias'
  | 'personalizada';

export type SunlightPreset =
  | 'sol_direto'
  | 'luz_indireta_intensa'
  | 'meia_sombra'
  | 'sombra'
  | 'personalizada';

export type FertilizingFrequencyPreset =
  | 'quinzenal'
  | 'mensal'
  | 'a_cada_2_meses'
  | 'a_cada_3_meses'
  | 'a_cada_6_meses'
  | 'anual'
  | 'nao_necessaria'
  | 'personalizada';

export interface PlantStructuredCare {
  // Rega
  wateringFrequency: WateringFrequencyPreset;
  customWateringDays?: number;
  soilMoistureCheck: string;

  // Iluminação
  sunlightType: SunlightPreset;
  customSunlight?: string;

  // Adubação
  fertilizerType: string;
  fertilizerFrequency: FertilizingFrequencyPreset;
  customFertilizerDays?: number;

  // Substrato
  substrate: string;

  // Temperatura e umidade
  temperature: string;
  humidity: string;

  // Manutenção
  maintenanceNotes: string;
}

export interface Plant {
  id: string;
  name: string;
  species: string;
  rgDigital: string;
  photo: string;
  environmentId: string;
  environmentName: string;
  collectionName?: string;
  birthDate: string; // Date added / acquired
  status: 'HEALTHY' | 'NEEDS_CARE' | 'DORMANT' | 'RECOVERING';
  healthScore: number; // 0 - 100
  careSchedule: CareSchedule;
  tutors: Tutor[];
  timeline: TimelineEvent[];
  qrCodeDataUrl?: string;
  isOrphan: boolean;
  orphanReason?: string;
  notes?: string;
  acquisitionStory?: string;
  sunlightNeeds: 'Sombra' | 'Luz Indireta' | 'Sol Pleno' | 'Meia Sombra';
  waterNeeds: 'Alta (2-3x/sem)' | 'Média (1-2x/sem)' | 'Baixa (1x/15dias)';
  careGuide?: SpeciesCareGuide;
  structuredCare?: PlantStructuredCare;
}

export interface SpeciesCareGuide {
  scientificName: string;
  commonName?: string;
  family?: string;
  isWellKnownSpecies: boolean;
  watering: {
    need: string;
    checkMethod: string;
    frequency: string;
    alert: string;
  };
  lighting: {
    type: string;
    idealLocation: string;
    warning: string;
  };
  fertilization: {
    type: string;
    frequency: string;
    caution: string;
  };
  substrate: {
    drainage: string;
    idealMix: string;
  };
  environment: {
    temperature: string;
    humidity: string;
    warning: string;
  };
  maintenance: {
    pruning: string;
    repotting: string;
    generalTips?: string;
  };
  confidenceNote: string;
  source?: string;
  lastUpdated?: string;
}

export interface Environment {
  id: string;
  name: string;
  iconName: string;
  description: string;
  plantCount: number;
  coverImage: string;
}

export interface PlantCollection {
  id: string;
  name: string;
  color: string;
  description: string;
  plantCount: number;
}

export interface DecisionOptionEvaluated {
  optionName: string;
  pros: string[];
  cons: string[];
  score: number;
  riskLevel: 'Baixo' | 'Médio' | 'Alto';
}

export interface ComparisonRow {
  optionName: string;
  botanicalImpact: string;
  effort: string;
  costAndRisks: string;
  longTermEffect: string;
}

export interface ComparisonTable {
  headers: string[];
  rows: ComparisonRow[];
}

export interface DecisionRecommendation {
  bestOption: string;
  rationale: string;
  actionSteps: string[];
}

export interface DecisionAnalysisResult {
  summary: string;
  prosAndCons: DecisionOptionEvaluated[];
  comparisonTable: ComparisonTable;
  impactAnalysis: string;
  recommendation: DecisionRecommendation;
}

export interface DecisionRequest {
  title: string;
  context?: string;
  category?: string;
  options?: string[];
}

export interface SavedDecision {
  id: string;
  createdAt: string;
  plantId?: string;
  plantName?: string;
  request: DecisionRequest;
  result: DecisionAnalysisResult;
}

export interface MarketplaceItem {
  id: string;
  plantId: string;
  plantName: string;
  plantSpecies: string;
  rgDigital: string;
  title: string;
  price: number; // 0 if free/donation
  type: 'VENDA' | 'TROCA' | 'DOACAO';
  sellerName: string;
  sellerType: 'HOBBYIST' | 'PRO';
  sellerAvatar: string;
  location: string;
  photo: string;
  description: string;
  verifiedRg: boolean;
  timelineEventCount: number;
  plantAgeYears: number;
}

export interface CommunityPost {
  id: string;
  authorName: string;
  authorAvatar: string;
  authorRole: 'Entusiasta' | 'Viveirista Profissional' | 'Botanista' | 'Guardião';
  timeAgo: string;
  title: string;
  content: string;
  plantName?: string;
  plantRg?: string;
  imageUrl?: string;
  likes: number;
  commentsCount: number;
  tags: string[];
}

export type IdentificationConfidence = 'alto' | 'medio' | 'baixo';

export interface BotanicalCareInfo {
  lighting: string;
  watering: string;
  pruning: string;
  fertilization: string;
}

export interface PlantIdentificationResult {
  isPlant: boolean;
  commonName: string | null;
  scientificName: string | null;
  confidence: IdentificationConfidence;
  isReliable: boolean;
  alternativeSpecies: string[];
  generalBotanicalCare: BotanicalCareInfo;
  environmentalConsiderations: string;
  identificationNotes: string;
}

export interface PlantIdentificationRequest {
  imageBase64: string;
  mimeType?: string;
  userNotes?: string;
}

export interface PlantNetCandidate {
  score: number; // e.g. 0.665
  scorePercentage: number; // e.g. 66.5
  scientificName: string;
  scientificNameWithoutAuthor: string;
  commonNames: string[];
  family?: string;
  genus?: string;
  sampleImageUrl?: string;
}

export interface PlantNetIdentificationResponse {
  success: boolean;
  bestMatch?: string;
  candidates: PlantNetCandidate[];
  remainingRequests?: number;
  message?: string;
}

export interface WishListItem {
  id: string;
  scientificName: string;
  popularName?: string;
  photoUrl: string;
  addedAt: string;
  careGuide?: SpeciesCareGuide;
  notes?: string;
}

export interface InitialPlantData {
  photoUrl?: string;
  species?: string;
  scientificName?: string;
  popularName?: string;
  name?: string;
  careGuide?: SpeciesCareGuide;
}

export interface WeatherLocation {
  latitude: number;
  longitude: number;
  name: string; // e.g. "Curitiba, Paraná, Brasil"
  type: 'current' | 'manual';
  savedAt: string;
}

export interface CurrentWeather {
  temperature: number; // in Celsius
  humidity?: number; // in %
  weatherCode: number;
  conditionText: string;
  isDay: boolean;
  observationTime: string; // Formatted time of measurement
  gardenInsight: string;
  sourceAttribution: string;
}

export interface GeocodingResult {
  id: number | string;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  formattedLabel: string;
}

export interface AuthState {
  userId: string | null;
  isAnonymous: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
  retryAuth: () => Promise<void>;
}

