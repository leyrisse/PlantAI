import React from 'react';
import { Plant } from '../types';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

interface DeletePlantConfirmModalProps {
  isOpen: boolean;
  plant: Plant | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeletePlantConfirmModal: React.FC<DeletePlantConfirmModalProps> = ({
  isOpen,
  plant,
  isDeleting,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !plant) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-red-100 space-y-0 animate-scaleUp">
        
        {/* Header Banner */}
        <div className="bg-red-50 p-6 border-b border-red-100 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-xs">
            <Trash2 className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-serif text-lg font-bold text-red-950">
              Excluir Planta do Jardim?
            </h3>
            <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
              Esta ação removerá a planta definitivamente do seu jardim.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="text-stone-400 hover:text-stone-600 p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Target Plant Summary Card */}
          <div className="flex items-center gap-3 p-3.5 bg-[#F5F5F0] rounded-2xl border border-[#5A5A40]/20">
            {plant.photo ? (
              <img
                src={plant.photo}
                alt={plant.name}
                className="w-14 h-14 rounded-xl object-cover border border-[#5A5A40]/30 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-[#2D3A2D] text-[#D4AF37] font-bold flex items-center justify-center shrink-0">
                🌱
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h4 className="font-serif text-sm font-bold text-[#2D3A2D] truncate">
                {plant.name}
              </h4>
              <p className="text-xs italic text-[#5A5A40] truncate font-serif">
                {plant.species}
              </p>
              <span className="inline-block mt-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-[#2D3A2D] text-[#D4AF37] rounded-md">
                {plant.rgDigital}
              </span>
            </div>
          </div>

          {/* Warning Message */}
          <div className="flex items-start gap-2.5 text-xs text-stone-600 bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Todo o histórico de regas, cronograma de cuidados, fotos e eventos da linha do tempo desta planta serão apagados. A exclusão afetará somente este espécime do seu jardim.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 sm:p-6 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold rounded-xl border border-stone-300 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Excluindo...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sim, Excluir Planta</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
