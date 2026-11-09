import React, { useState } from 'react';
import { SpeciesCareGuide } from '../types';
import {
  ChevronDown,
  ChevronUp,
  BookOpen,
  Droplets,
  Sun,
  Sprout,
  Layers,
  Thermometer,
  Scissors,
  Info,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';

interface SpeciesCareAccordionProps {
  careGuide: SpeciesCareGuide;
  defaultOpen?: boolean;
}

export const SpeciesCareAccordion: React.FC<SpeciesCareAccordionProps> = ({
  careGuide,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-[#5A5A40]/25 rounded-2xl bg-white overflow-hidden shadow-2xs transition-all">
      {/* Accordion Header / Disclosure Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full px-4 py-3 bg-[#FAF8F5] hover:bg-[#F5F5F0] transition-colors flex items-center justify-between gap-3 text-left cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-emerald-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#2D3A2D]">
                Diretrizes da espécie
              </span>
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                IA Botânica
              </span>
            </div>
            <p className="text-[10px] text-[#5A5A40]">
              {careGuide.scientificName} • Clique para {isOpen ? 'recolher' : 'ver todas as orientações botânicas completas'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[#5A5A40] text-xs font-medium">
          <span className="text-[10px] hidden sm:inline">{isOpen ? 'Recolher' : 'Expandir'}</span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-[#2D3A2D]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#2D3A2D]" />
          )}
        </div>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div className="p-4 sm:p-5 border-t border-[#5A5A40]/15 space-y-4 bg-white animate-fadeIn">
          {/* Scientific Context */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#5A5A40]/10 text-xs">
            <div>
              <span className="font-bold italic text-[#2D3A2D]">{careGuide.scientificName}</span>
              {careGuide.commonName && (
                <span className="text-[#5A5A40] ml-1.5">({careGuide.commonName})</span>
              )}
            </div>
            {careGuide.family && (
              <span className="text-[10px] text-[#5A5A40] bg-[#FAF8F5] px-2 py-0.5 rounded-md border border-[#5A5A40]/15">
                Família: {careGuide.family}
              </span>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#2D3A2D]">
            {/* Rega */}
            <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-100 space-y-1.5">
              <span className="font-bold text-sky-900 flex items-center gap-1.5 text-xs">
                <Droplets className="w-3.5 h-3.5 text-sky-700" /> Rega e Irrigação
              </span>
              <p className="font-medium text-[11px] text-sky-950">
                <strong>Necessidade:</strong> {careGuide.watering.need || 'Não informado'}
                {careGuide.watering.wateringDaysRecommended && (
                  <span className="ml-1 text-sky-800 font-bold">
                    (Média de referência: a cada {careGuide.watering.wateringDaysRecommended} dias)
                  </span>
                )}
              </p>
              <p className="text-[11px] text-sky-900">
                <strong>Frequência média:</strong> {careGuide.watering.frequency || 'Não informado'}
              </p>
              <p className="text-[10px] text-sky-800 bg-white/60 p-2 rounded-lg border border-sky-100">
                <strong>Como verificar:</strong> {careGuide.watering.checkMethod || 'Não informado'}
              </p>
              {careGuide.watering.alert && (
                <p className="text-[10px] text-sky-700 italic">{careGuide.watering.alert}</p>
              )}
            </div>

            {/* Iluminação */}
            <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-100 space-y-1.5">
              <span className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                <Sun className="w-3.5 h-3.5 text-amber-700" /> Iluminação
              </span>
              <p className="font-medium text-[11px] text-amber-950">
                <strong>Exposição:</strong> {careGuide.lighting.type || 'Não informado'}
              </p>
              <p className="text-[11px] text-amber-900">
                <strong>Local ideal:</strong> {careGuide.lighting.idealLocation || 'Não informado'}
              </p>
              {careGuide.lighting.warning && (
                <p className="text-[10px] text-amber-800 bg-white/60 p-2 rounded-lg border border-amber-100">
                  <strong>Atenção:</strong> {careGuide.lighting.warning}
                </p>
              )}
            </div>

            {/* Toxicidade e Segurança */}
            <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-100 space-y-1.5">
              <span className="font-bold text-rose-900 flex items-center gap-1.5 text-xs">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-700" /> Toxicidade e Segurança Doméstica
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  careGuide.toxicity?.level === 'toxica'
                    ? 'bg-rose-200 text-rose-900'
                    : careGuide.toxicity?.level === 'moderadamente_toxica'
                    ? 'bg-amber-200 text-amber-900'
                    : careGuide.toxicity?.level === 'segura'
                    ? 'bg-emerald-200 text-emerald-900'
                    : 'bg-stone-200 text-stone-800'
                }`}>
                  {careGuide.toxicity?.level === 'toxica'
                    ? 'Tóxica (Alta)'
                    : careGuide.toxicity?.level === 'moderadamente_toxica'
                    ? 'Moderadamente Tóxica'
                    : careGuide.toxicity?.level === 'segura'
                    ? 'Pet-Friendly (Segura)'
                    : careGuide.toxicity?.level === 'possivel_risco'
                    ? 'Possível Risco'
                    : 'Dados Insuficientes'}
                </span>
                <span className="text-[10px] text-[#5A5A40]">
                  Pets: {careGuide.toxicity?.toxicToPets === true ? 'Tóxica' : careGuide.toxicity?.toxicToPets === false ? 'Segura' : 'Não confirmado'}
                </span>
              </div>
              <p className="text-[11px] text-rose-950 font-medium leading-relaxed">
                {careGuide.toxicity?.warningText || 'Mantenha fora do alcance de animais e crianças se houver dúvidas.'}
              </p>
              {careGuide.toxicity?.principles && (
                <p className="text-[10px] text-rose-800 bg-white/60 p-1.5 rounded-lg border border-rose-100">
                  <strong>Princípio ativo:</strong> {careGuide.toxicity.principles}
                </p>
              )}
            </div>

            {/* Adubação */}
            <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-100 space-y-1.5">
              <span className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs">
                <Sprout className="w-3.5 h-3.5 text-emerald-700" /> Adubação e Nutrientes
              </span>
              <p className="font-medium text-[11px] text-emerald-950">
                <strong>Tipo recomendado:</strong> {careGuide.fertilization.type || 'Não informado'}
              </p>
              <p className="text-[11px] text-emerald-900">
                <strong>Frequência:</strong> {careGuide.fertilization.frequency || 'Não informado'}
              </p>
              {careGuide.fertilization.caution && (
                <p className="text-[10px] text-emerald-800 bg-white/60 p-2 rounded-lg border border-emerald-100">
                  <strong>Cuidado:</strong> {careGuide.fertilization.caution}
                </p>
              )}
            </div>

            {/* Substrato */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 space-y-1.5">
              <span className="font-bold text-stone-900 flex items-center gap-1.5 text-xs">
                <Layers className="w-3.5 h-3.5 text-stone-700" /> Substrato e Drenagem
              </span>
              <p className="font-medium text-[11px] text-stone-950">
                <strong>Drenagem:</strong> {careGuide.substrate.drainage || 'Não informado'}
              </p>
              <p className="text-[11px] text-stone-800">
                <strong>Mistura ideal:</strong> {careGuide.substrate.idealMix || 'Não informado'}
              </p>
            </div>

            {/* Clima e Temperatura */}
            <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-100 space-y-1.5">
              <span className="font-bold text-teal-900 flex items-center gap-1.5 text-xs">
                <Thermometer className="w-3.5 h-3.5 text-teal-700" /> Temperatura e Umidade
              </span>
              <p className="font-medium text-[11px] text-teal-950">
                <strong>Temperatura:</strong> {careGuide.environment.temperature || 'Não informado'}
              </p>
              <p className="text-[11px] text-teal-900">
                <strong>Umidade do ar:</strong> {careGuide.environment.humidity || 'Não informado'}
              </p>
              {careGuide.environment.warning && (
                <p className="text-[10px] text-teal-800 italic">{careGuide.environment.warning}</p>
              )}
            </div>

            {/* Manutenção e Poda */}
            <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-100 space-y-1.5">
              <span className="font-bold text-purple-900 flex items-center gap-1.5 text-xs">
                <Scissors className="w-3.5 h-3.5 text-purple-700" /> Manutenção e Poda
              </span>
              <p className="font-medium text-[11px] text-purple-950">
                <strong>Poda:</strong> {careGuide.maintenance.pruning || 'Não informado'}
              </p>
              <p className="text-[11px] text-purple-900">
                <strong>Troca de vaso:</strong> {careGuide.maintenance.repotting || 'Não informado'}
              </p>
              {careGuide.maintenance.generalTips && (
                <p className="text-[10px] text-purple-800 italic">{careGuide.maintenance.generalTips}</p>
              )}
            </div>
          </div>

          {/* Confidence and Disclaimer */}
          {careGuide.confidenceNote && (
            <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#5A5A40]/15 text-[11px] text-[#5A5A40] flex items-start gap-2">
              <Info className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#2D3A2D]">Nota botânica:</p>
                <p>{careGuide.confidenceNote}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
