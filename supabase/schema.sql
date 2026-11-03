-- ==============================================================================
-- PlantAI — Estrutura da Tabela do Jardim (plants) e Políticas de Segurança (RLS)
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase (Dashboard > SQL Editor)
-- para criar a tabela de plantas e habilitar o isolamento seguro por usuário.
-- Suporta tanto visitantes anônimos (Anonymous Auth) quanto contas definitivas.
-- ==============================================================================

-- 1. Criação da tabela de plantas do jardim
create table if not exists public.plants (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  species text not null,
  rg_digital text not null,
  photo text,
  environment_id text default 'env-geral',
  environment_name text default 'Geral',
  collection_name text,
  birth_date text,
  status text default 'HEALTHY',
  health_score integer default 100,
  sunlight_needs text,
  water_needs text,
  care_schedule jsonb default '{}'::jsonb,
  structured_care jsonb,
  care_guide jsonb,
  tutors jsonb default '[]'::jsonb,
  timeline jsonb default '[]'::jsonb,
  is_orphan boolean default false,
  orphan_reason text,
  notes text,
  acquisition_story text,
  qr_code_data_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habilitação obrigatória do Row Level Security (RLS)
alter table public.plants enable row level security;

-- 3. Políticas de Segurança (RLS)
-- Garantem isolamento estrito: nenhum visitante ou usuário tem acesso a plantas alheias.

-- Leitura: usuário só visualiza suas próprias plantas
drop policy if exists "Users can view their own plants" on public.plants;
create policy "Users can view their own plants"
  on public.plants for select
  using (auth.uid() = user_id);

-- Criação: usuário só pode cadastrar plantas com seu próprio user_id
drop policy if exists "Users can insert their own plants" on public.plants;
create policy "Users can insert their own plants"
  on public.plants for insert
  with check (auth.uid() = user_id);

-- Atualização: usuário só pode modificar registros pertencentes ao seu user_id
drop policy if exists "Users can update their own plants" on public.plants;
create policy "Users can update their own plants"
  on public.plants for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Exclusão: usuário só pode remover plantas do seu próprio jardim
drop policy if exists "Users can delete their own plants" on public.plants;
create policy "Users can delete their own plants"
  on public.plants for delete
  using (auth.uid() = user_id);

-- 4. Índice de consulta por usuário para resposta instantânea
create index if not exists idx_plants_user_id on public.plants(user_id);
create index if not exists idx_plants_created_at on public.plants(created_at desc);
