import React, { useState } from 'react';
import { Database, Copy, Check, X, ShieldCheck, ExternalLink } from 'lucide-react';

interface SupabaseSqlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SQL_SCRIPT = `-- ==============================================================================
-- PlantAI — Estrutura da Tabela do Jardim (plants) e Políticas de Segurança (RLS)
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase (Dashboard > SQL Editor)
-- para criar a tabela de plantas e habilitar o isolamento seguro por visitante.
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

-- 2. Habilitação do Row Level Security (RLS)
alter table public.plants enable row level security;

-- 3. Políticas de Segurança (Isolamento por Usuário)
drop policy if exists "Users can view their own plants" on public.plants;
create policy "Users can view their own plants"
  on public.plants for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own plants" on public.plants;
create policy "Users can insert their own plants"
  on public.plants for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own plants" on public.plants;
create policy "Users can update their own plants"
  on public.plants for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own plants" on public.plants;
create policy "Users can delete their own plants"
  on public.plants for delete
  using (auth.uid() = user_id);

-- 4. Índice de performance
create index if not exists idx_plants_user_id on public.plants(user_id);
create index if not exists idx_plants_created_at on public.plants(created_at desc);
`;

export const SupabaseSqlModal: React.FC<SupabaseSqlModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SQL_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-stone-200 flex flex-col animate-scaleUp">
        
        {/* Header */}
        <div className="bg-[#2D3A2D] text-[#F5F5F0] p-6 flex items-start justify-between border-b border-[#5A5A40]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#5A5A40] text-[#D4AF37] flex items-center justify-center font-bold shadow-xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#F5F5F0]">
                Configuração da Tabela no Supabase
              </h3>
              <p className="text-xs text-[#F5F5F0]/80 mt-0.5">
                Script SQL para criar a tabela <span className="font-mono text-[#D4AF37]">plants</span> e as políticas RLS.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#F5F5F0]/70 hover:text-[#F5F5F0] p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instructions */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs text-stone-700">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <ShieldCheck className="w-4 h-4 text-amber-700" />
              Como aplicar no Supabase:
            </div>
            <ol className="list-decimal list-inside space-y-1 text-amber-800">
              <li>Acesse o painel do seu projeto no Supabase.</li>
              <li>No menu lateral esquerdo, clique em <strong>SQL Editor</strong>.</li>
              <li>Clique em <strong>New Query</strong>, cole o código abaixo e clique em <strong>Run</strong>.</li>
              <li>A tabela <code className="bg-white px-1 py-0.5 rounded font-mono">public.plants</code> será criada com RLS ativo.</li>
            </ol>
          </div>

          <div className="relative">
            <div className="flex items-center justify-between pb-2">
              <span className="font-mono text-[11px] font-bold text-stone-500">
                supabase/schema.sql
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span className="text-[#D4AF37]">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Script SQL</span>
                  </>
                )}
              </button>
            </div>

            <pre className="bg-[#182318] text-[#D4AF37] p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-72 border border-[#5A5A40]/40 leading-relaxed">
              {SQL_SCRIPT}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
};
