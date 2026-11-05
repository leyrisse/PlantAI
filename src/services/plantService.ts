import { Plant } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export const BASE_STORAGE_KEY_PLANTS = 'jardim_plants_v1';

export function getStorageKey(baseKey: string, userId?: string | null): string {
  if (userId) {
    return `${baseKey}_${userId}`;
  }
  return baseKey;
}

/**
 * Loads plants from localStorage for the given user identity.
 * Starts with [] for new visitors (never returns mock data).
 */
export function loadLocalPlants(userId?: string | null): Plant[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return [];
  }
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
    console.warn('[PlantAI / PlantService] Erro ao carregar plantas do localStorage:', e);
  }
  return [];
}

/**
 * Saves plants to scoped localStorage.
 */
export function saveLocalPlants(plants: Plant[], userId?: string | null): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    const userKey = getStorageKey(BASE_STORAGE_KEY_PLANTS, userId);
    localStorage.setItem(userKey, JSON.stringify(plants));
  } catch (e) {
    console.warn('[PlantAI / PlantService] Erro ao salvar plantas no localStorage:', e);
  }
}

/**
 * Mappers between Plant TypeScript model and Supabase PostgreSQL row
 */
export function plantToDbRow(plant: Plant, userId: string) {
  return {
    id: plant.id,
    user_id: userId,
    name: plant.name,
    species: plant.species,
    rg_digital: plant.rgDigital,
    photo: plant.photo || '',
    environment_id: plant.environmentId || 'env-geral',
    environment_name: plant.environmentName || 'Geral',
    collection_name: plant.collectionName || null,
    birth_date: plant.birthDate || new Date().toISOString().split('T')[0],
    status: plant.status || 'HEALTHY',
    health_score: typeof plant.healthScore === 'number' ? plant.healthScore : 100,
    sunlight_needs: plant.sunlightNeeds || 'Luz Indireta',
    water_needs: plant.waterNeeds || 'Média (1-2x/sem)',
    care_schedule: plant.careSchedule || {},
    structured_care: plant.structuredCare || null,
    care_guide: plant.careGuide || null,
    tutors: Array.isArray(plant.tutors) ? plant.tutors : [],
    timeline: Array.isArray(plant.timeline) ? plant.timeline : [],
    is_orphan: Boolean(plant.isOrphan),
    orphan_reason: plant.orphanReason || null,
    notes: plant.notes || null,
    acquisition_story: plant.acquisitionStory || null,
    qr_code_data_url: plant.qrCodeDataUrl || null,
    updated_at: new Date().toISOString(),
  };
}

export function dbRowToPlant(row: any): Plant {
  return {
    id: String(row.id),
    name: row.name || 'Sem nome',
    species: row.species || '',
    rgDigital: row.rg_digital || '',
    photo: row.photo || '',
    environmentId: row.environment_id || 'env-geral',
    environmentName: row.environment_name || 'Geral',
    collectionName: row.collection_name || undefined,
    birthDate: row.birth_date || new Date().toISOString().split('T')[0],
    status: (row.status as Plant['status']) || 'HEALTHY',
    healthScore: typeof row.health_score === 'number' ? row.health_score : 100,
    sunlightNeeds: row.sunlight_needs || 'Luz Indireta',
    waterNeeds: row.water_needs || 'Média (1-2x/sem)',
    careSchedule: {
      waterFrequencyDays: Number(row.care_schedule?.waterFrequencyDays) || 7,
      fertilizeFrequencyDays: Number(row.care_schedule?.fertilizeFrequencyDays) || 30,
      pruneFrequencyDays: Number(row.care_schedule?.pruneFrequencyDays) || 90,
      lastWatered: row.care_schedule?.lastWatered || undefined,
      lastFertilized: row.care_schedule?.lastFertilized || undefined,
      lastPruned: row.care_schedule?.lastPruned || undefined,
    },
    structuredCare: row.structured_care || undefined,
    careGuide: row.care_guide || undefined,
    tutors: Array.isArray(row.tutors) ? row.tutors : [],
    timeline: Array.isArray(row.timeline) ? row.timeline : [],
    isOrphan: Boolean(row.is_orphan),
    orphanReason: row.orphan_reason || undefined,
    notes: row.notes || undefined,
    acquisitionStory: row.acquisition_story || undefined,
    qrCodeDataUrl: row.qr_code_data_url || undefined,
  };
}

function isTableMissingError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

export interface FetchPlantsResult {
  data: Plant[];
  error?: string;
  isTableMissing?: boolean;
  fromSupabase: boolean;
}

/**
 * Fetches the user's plants from Supabase (filtered by user_id via RLS).
 * If Supabase is not configured, or if the table doesn't exist yet, returns local plants with status flags.
 */
export async function fetchUserPlants(userId?: string | null): Promise<FetchPlantsResult> {
  const localPlants = loadLocalPlants(userId);

  if (!isSupabaseConfigured() || !userId) {
    return {
      data: localPlants,
      fromSupabase: false,
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      data: localPlants,
      fromSupabase: false,
    };
  }

  try {
    const { data, error } = await client
      .from('plants')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isTableMissingError(error)) {
        console.info('[PlantAI / Supabase] Tabela "plants" ainda não criada no banco. Usando armazenamento local.');
        return {
          data: localPlants,
          error: 'Tabela "plants" não encontrada no Supabase. Crie a tabela via SQL Editor.',
          isTableMissing: true,
          fromSupabase: false,
        };
      }
      console.warn('[PlantAI / Supabase] Erro ao consultar plantas:', error.message);
      return {
        data: localPlants,
        error: `Falha ao sincronizar com Supabase: ${error.message}`,
        fromSupabase: false,
      };
    }

    const plants = (data || []).map(dbRowToPlant);
    return {
      data: plants,
      fromSupabase: true,
    };
  } catch (err: any) {
    console.warn('[PlantAI / Supabase] Exceção de rede ao buscar plantas:', err?.message || err);
    return {
      data: localPlants,
      error: 'Não foi possível conectar ao Supabase para carregar as plantas. Modo local ativo.',
      fromSupabase: false,
    };
  }
}

export interface PlantMutationResult {
  data?: Plant;
  success: boolean;
  error?: string;
  isTableMissing?: boolean;
  savedInSupabase: boolean;
}

/**
 * Persists a new plant to Supabase.
 * Enforces ownership with user_id, dynamically resolving the user session if needed.
 */
export async function createUserPlant(plant: Plant, userId?: string | null): Promise<PlantMutationResult> {
  if (!isSupabaseConfigured()) {
    return {
      data: plant,
      success: true,
      savedInSupabase: false,
      error: 'Supabase não configurado. Planta salva no armazenamento local.',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      data: plant,
      success: true,
      savedInSupabase: false,
      error: 'Cliente Supabase indisponível. Planta salva no armazenamento local.',
    };
  }

  // Resolve user_id: if not provided by caller, check existing Supabase Auth session
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    try {
      const { data: sessionData } = await client.auth.getSession();
      effectiveUserId = sessionData?.session?.user?.id || null;
    } catch (authErr) {
      console.warn('[PlantAI / PlantService] Não foi possível recuperar sessão ativa do Supabase:', authErr);
    }
  }

  if (!effectiveUserId) {
    return {
      data: plant,
      success: true,
      savedInSupabase: false,
      error: 'Sessão de usuário não autenticada no Supabase. Planta preservada localmente.',
    };
  }

  try {
    const row = plantToDbRow(plant, effectiveUserId);
    const { data, error } = await client
      .from('plants')
      .insert([row])
      .select()
      .single();

    if (error) {
      if (isTableMissingError(error)) {
        return {
          data: plant,
          success: true,
          isTableMissing: true,
          savedInSupabase: false,
          error: 'Tabela "plants" ainda não criada no Supabase. Planta salva localmente.',
        };
      }
      return {
        success: false,
        savedInSupabase: false,
        error: `Erro ao salvar planta no banco: ${error.message}`,
      };
    }

    return {
      data: dbRowToPlant(data),
      success: true,
      savedInSupabase: true,
    };
  } catch (err: any) {
    return {
      success: false,
      savedInSupabase: false,
      error: `Erro de rede ao salvar planta no Supabase: ${err?.message || err}`,
    };
  }
}

/**
 * Updates an existing plant in Supabase.
 * Respects RLS: only updates if user_id matches.
 */
export async function updateUserPlant(plant: Plant, userId?: string | null): Promise<PlantMutationResult> {
  if (!isSupabaseConfigured() || !userId) {
    return {
      data: plant,
      success: true,
      savedInSupabase: false,
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      data: plant,
      success: true,
      savedInSupabase: false,
    };
  }

  try {
    const row = plantToDbRow(plant, userId);
    const { data, error } = await client
      .from('plants')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      if (isTableMissingError(error)) {
        return {
          data: plant,
          success: true,
          isTableMissing: true,
          savedInSupabase: false,
          error: 'Tabela "plants" ainda não criada no Supabase. Alterações salvas localmente.',
        };
      }
      return {
        success: false,
        savedInSupabase: false,
        error: `Erro ao atualizar planta no banco: ${error.message}`,
      };
    }

    return {
      data: data ? dbRowToPlant(data) : plant,
      success: true,
      savedInSupabase: true,
    };
  } catch (err: any) {
    return {
      success: false,
      savedInSupabase: false,
      error: `Erro de rede ao atualizar planta no Supabase: ${err?.message || err}`,
    };
  }
}

export interface DeletePlantResult {
  success: boolean;
  error?: string;
  isTableMissing?: boolean;
  deletedFromSupabase: boolean;
}

/**
 * Deletes a plant belonging strictly to the authenticated user.
 * In Supabase: eq('id', plantId).eq('user_id', userId)
 */
export async function deleteUserPlant(plantId: string, userId?: string | null): Promise<DeletePlantResult> {
  if (!isSupabaseConfigured() || !userId) {
    return {
      success: true,
      deletedFromSupabase: false,
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: true,
      deletedFromSupabase: false,
    };
  }

  try {
    const { error, count } = await client
      .from('plants')
      .delete({ count: 'exact' })
      .eq('id', plantId)
      .eq('user_id', userId);

    if (error) {
      if (isTableMissingError(error)) {
        return {
          success: true,
          isTableMissing: true,
          deletedFromSupabase: false,
          error: 'Tabela "plants" ainda não criada no Supabase. Planta removida do armazenamento local.',
        };
      }
      return {
        success: false,
        deletedFromSupabase: false,
        error: `Falha ao excluir planta no Supabase: ${error.message}`,
      };
    }

    return {
      success: true,
      deletedFromSupabase: true,
    };
  } catch (err: any) {
    return {
      success: false,
      deletedFromSupabase: false,
      error: `Erro de rede ao excluir planta: ${err?.message || err}`,
    };
  }
}
