import React from 'react';
import { Camera, MapPin, Sparkles, ShieldCheck, HeartHandshake, ArrowRight, X } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartAsVisitor: () => void;
  isFirstAccess?: boolean;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onStartAsVisitor,
  isFirstAccess = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-[#5A5A40]/30 shadow-2xl space-y-6 my-auto max-h-[92vh] overflow-y-auto">
        
        {/* Header with PlantAI logo */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#2D3A2D] text-[#D4AF37] flex items-center justify-center shadow-sm">
              <Sparkles className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#2D3A2D]">
                PlantAI
              </h2>
              <p className="text-xs text-[#5A5A40] font-medium">
                Identificação botânica e cuidados do seu jardim
              </p>
            </div>
          </div>

          {!isFirstAccess && (
            <button
              type="button"
              onClick={onClose}
              className="text-[#5A5A40] hover:text-[#2D3A2D] p-1.5 rounded-xl hover:bg-[#F5F5F0] transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Value Proposition Description */}
        <div className="space-y-2 text-[#2D3A2D] text-sm leading-relaxed">
          <p className="font-serif text-base text-[#2D3A2D] font-bold">
            Bem-vindo ao seu novo assistente botânico!
          </p>
          <p className="text-[#5A5A40] text-xs">
            O PlantAI foi feito para quem ama plantas. Ele ajuda você a descobrir instantaneamente a espécie de qualquer planta e organizar rotinas personalizadas de rega, adubação e poda.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="space-y-3">
          
          <div className="flex items-start gap-3 bg-[#F5F5F0] p-3.5 rounded-2xl border border-[#5A5A40]/15">
            <div className="w-9 h-9 rounded-xl bg-white text-emerald-800 flex items-center justify-center shrink-0 border border-[#5A5A40]/15">
              <Camera className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#2D3A2D]">Identificação com Câmera</h4>
              <p className="text-[11px] text-[#5A5A40] mt-0.5 leading-snug">
                Fotografe uma folha ou flor para identificar a espécie e acessar recomendações reais de cultivo.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[#F5F5F0] p-3.5 rounded-2xl border border-[#5A5A40]/15">
            <div className="w-9 h-9 rounded-xl bg-white text-sky-800 flex items-center justify-center shrink-0 border border-[#5A5A40]/15">
              <MapPin className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#2D3A2D]">Clima e Cuidados Adaptados</h4>
              <p className="text-[11px] text-[#5A5A40] mt-0.5 leading-snug">
                O aplicativo pode solicitar sua localização para mostrar a temperatura local das plantas. Se preferir, você também pode informar sua cidade manualmente ou recusar a qualquer momento.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[#F5F5F0] p-3.5 rounded-2xl border border-[#5A5A40]/15">
            <div className="w-9 h-9 rounded-xl bg-white text-[#D4AF37] flex items-center justify-center shrink-0 border border-[#5A5A40]/15">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#2D3A2D]">Sem necessidade de cadastro</h4>
              <p className="text-[11px] text-[#5A5A40] mt-0.5 leading-snug">
                Você começa imediatamente como visitante. Suas plantas e registros de cuidados ficam guardados com segurança no seu próprio navegador.
              </p>
            </div>
          </div>

        </div>

        {/* Action Button */}
        <div className="pt-2 space-y-3">
          <button
            type="button"
            onClick={onStartAsVisitor}
            className="w-full py-3.5 px-5 bg-[#2D3A2D] hover:bg-[#1f291f] text-[#F5F5F0] font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 border border-[#D4AF37]/50 cursor-pointer group"
          >
            <span>Começar como visitante</span>
            <ArrowRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-0.5 transition-transform" />
          </button>

          <p className="text-[11px] text-center text-[#5A5A40]">
            Não é necessário criar conta, e-mail ou senha. A câmera será aberta para você começar.
          </p>
        </div>

      </div>
    </div>
  );
};
