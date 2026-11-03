import React, { useState, useMemo } from 'react';
import { Plant, CareTaskType } from '../types';
import { calculateNextCareDate, formatDisplayDate, parseLocalDate, getLocalTodayDateStr } from '../utils/dateUtils';
import {
  Calendar as CalendarIcon,
  Droplets,
  Sprout,
  Scissors,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplet,
  Leaf,
  Shovel,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface CareCalendarModuleProps {
  plants: Plant[];
  onLogCareTask: (plantId: string, taskType: CareTaskType) => void;
  onSelectPlant?: (plant: Plant) => void;
}

interface CalendarCareEventItem {
  plant: Plant;
  taskType: 'WATER' | 'FERTILIZE' | 'PRUNE';
  scheduledDateStr: string;
  isOverdue: boolean;
  statusText?: string;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatFullDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.trim().split('-');
  if (parts.length === 3) {
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[0], 10);
    const month = MONTH_NAMES[m] ? MONTH_NAMES[m].toLowerCase() : '';
    return `${d} de ${month} de ${y}`;
  }
  return formatDisplayDate(dateStr);
}

export const CareCalendarModule: React.FC<CareCalendarModuleProps> = ({
  plants,
  onLogCareTask,
  onSelectPlant,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'WATER' | 'FERTILIZE' | 'PRUNE'>('ALL');

  // Month navigation: starts at current local month and year
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // Selected calendar date: starts on local today
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => getLocalTodayDateStr());

  const todayDateStr = getLocalTodayDateStr();

  // Month navigation handlers
  const handlePrevMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDateStr(todayDateStr);
  };

  /**
   * Calendar grid generation for currentMonthDate:
   * Generates cells with exact local year/month/day avoiding timezone shifts.
   */
  const calendarCells = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: Array<{
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    // Leading days from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonthIdx = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const str = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        dateStr: str,
        isCurrentMonth: false,
        isToday: str === todayDateStr,
        isSelected: str === selectedDateStr,
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const str = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        dateStr: str,
        isCurrentMonth: true,
        isToday: str === todayDateStr,
        isSelected: str === selectedDateStr,
      });
    }

    // Trailing days to fill standard 7-column grid
    const remainingSlots = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remainingSlots; d++) {
      const nextMonthIdx = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const str = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        dateStr: str,
        isCurrentMonth: false,
        isToday: str === todayDateStr,
        isSelected: str === selectedDateStr,
      });
    }

    return cells;
  }, [currentMonthDate, selectedDateStr, todayDateStr]);

  /**
   * Care events calculation:
   * Maps all plant scheduled care dates for water, fertilize, and prune.
   * Strictly preserves real data: does NOT invent prune dates if lastPruned is undefined.
   */
  const { careMapByDate, overdueTasksList } = useMemo(() => {
    const map: Record<
      string,
      {
        hasWater: boolean;
        hasFertilize: boolean;
        hasPrune: boolean;
        items: CalendarCareEventItem[];
      }
    > = {};

    const overdueList: CalendarCareEventItem[] = [];

    const ensureSlot = (dStr: string) => {
      if (!map[dStr]) {
        map[dStr] = {
          hasWater: false,
          hasFertilize: false,
          hasPrune: false,
          items: [],
        };
      }
      return map[dStr];
    };

    const curYear = currentMonthDate.getFullYear();
    const curMonth = currentMonthDate.getMonth();

    // Visible window: from 1 month before to 2 months after displayed month
    const minWindow = new Date(curYear, curMonth - 1, 1);
    const maxWindow = new Date(curYear, curMonth + 2, 0);
    const todayParsed = parseLocalDate(todayDateStr);

    plants.forEach((plant) => {
      // 1. WATER
      if (plant.careSchedule?.lastWatered && (plant.careSchedule?.waterFrequencyDays || 0) > 0) {
        const freq = plant.careSchedule.waterFrequencyDays;
        const nextCare = calculateNextCareDate(plant.careSchedule.lastWatered, freq);

        if (nextCare.nextDateStr) {
          const directDate = parseLocalDate(nextCare.nextDateStr);
          const isOverdue = directDate < todayParsed;

          if (isOverdue) {
            overdueList.push({
              plant,
              taskType: 'WATER',
              scheduledDateStr: nextCare.nextDateStr,
              isOverdue: true,
              statusText: nextCare.statusText,
            });
          }

          // Register primary next care date
          const slot = ensureSlot(nextCare.nextDateStr);
          slot.hasWater = true;
          if (!slot.items.some((i) => i.plant.id === plant.id && i.taskType === 'WATER')) {
            slot.items.push({
              plant,
              taskType: 'WATER',
              scheduledDateStr: nextCare.nextDateStr,
              isOverdue,
              statusText: nextCare.statusText,
            });
          }
        }

        // Project recurring dates in the calendar window
        let cur = parseLocalDate(plant.careSchedule.lastWatered);
        cur.setDate(cur.getDate() + freq);

        while (cur <= maxWindow) {
          if (cur >= minWindow) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            const dStr = `${y}-${m}-${d}`;

            const slot = ensureSlot(dStr);
            slot.hasWater = true;
            if (!slot.items.some((i) => i.plant.id === plant.id && i.taskType === 'WATER')) {
              slot.items.push({
                plant,
                taskType: 'WATER',
                scheduledDateStr: dStr,
                isOverdue: cur < todayParsed,
                statusText: cur < todayParsed ? 'Atrasado' : undefined,
              });
            }
          }
          cur.setDate(cur.getDate() + freq);
        }
      }

      // 2. FERTILIZATION
      if (plant.careSchedule?.lastFertilized && (plant.careSchedule?.fertilizeFrequencyDays || 0) > 0) {
        const freq = plant.careSchedule.fertilizeFrequencyDays;
        const nextCare = calculateNextCareDate(plant.careSchedule.lastFertilized, freq);

        if (nextCare.nextDateStr) {
          const directDate = parseLocalDate(nextCare.nextDateStr);
          const isOverdue = directDate < todayParsed;

          if (isOverdue) {
            overdueList.push({
              plant,
              taskType: 'FERTILIZE',
              scheduledDateStr: nextCare.nextDateStr,
              isOverdue: true,
              statusText: nextCare.statusText,
            });
          }

          const slot = ensureSlot(nextCare.nextDateStr);
          slot.hasFertilize = true;
          if (!slot.items.some((i) => i.plant.id === plant.id && i.taskType === 'FERTILIZE')) {
            slot.items.push({
              plant,
              taskType: 'FERTILIZE',
              scheduledDateStr: nextCare.nextDateStr,
              isOverdue,
              statusText: nextCare.statusText,
            });
          }
        }

        let cur = parseLocalDate(plant.careSchedule.lastFertilized);
        cur.setDate(cur.getDate() + freq);

        while (cur <= maxWindow) {
          if (cur >= minWindow) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            const dStr = `${y}-${m}-${d}`;

            const slot = ensureSlot(dStr);
            slot.hasFertilize = true;
            if (!slot.items.some((i) => i.plant.id === plant.id && i.taskType === 'FERTILIZE')) {
              slot.items.push({
                plant,
                taskType: 'FERTILIZE',
                scheduledDateStr: dStr,
                isOverdue: cur < todayParsed,
                statusText: cur < todayParsed ? 'Atrasado' : undefined,
              });
            }
          }
          cur.setDate(cur.getDate() + freq);
        }
      }

      // 3. PRUNING (Strict: only if lastPruned is present)
      if (plant.careSchedule?.lastPruned && (plant.careSchedule?.pruneFrequencyDays || 90) > 0) {
        const freq = plant.careSchedule.pruneFrequencyDays || 90;
        const nextCare = calculateNextCareDate(plant.careSchedule.lastPruned, freq);

        if (nextCare.nextDateStr) {
          const directDate = parseLocalDate(nextCare.nextDateStr);
          const isOverdue = directDate < todayParsed;

          if (isOverdue) {
            overdueList.push({
              plant,
              taskType: 'PRUNE',
              scheduledDateStr: nextCare.nextDateStr,
              isOverdue: true,
              statusText: nextCare.statusText,
            });
          }

          const slot = ensureSlot(nextCare.nextDateStr);
          slot.hasPrune = true;
          if (!slot.items.some((i) => i.plant.id === plant.id && i.taskType === 'PRUNE')) {
            slot.items.push({
              plant,
              taskType: 'PRUNE',
              scheduledDateStr: nextCare.nextDateStr,
              isOverdue,
              statusText: nextCare.statusText,
            });
          }
        }

        let cur = parseLocalDate(plant.careSchedule.lastPruned);
        cur.setDate(cur.getDate() + freq);

        while (cur <= maxWindow) {
          if (cur >= minWindow) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            const dStr = `${y}-${m}-${d}`;

            const slot = ensureSlot(dStr);
            slot.hasPrune = true;
            if (!slot.items.some((i) => i.plant.id === plant.id && i.taskType === 'PRUNE')) {
              slot.items.push({
                plant,
                taskType: 'PRUNE',
                scheduledDateStr: dStr,
                isOverdue: cur < todayParsed,
                statusText: cur < todayParsed ? 'Atrasado' : undefined,
              });
            }
          }
          cur.setDate(cur.getDate() + freq);
        }
      }
    });

    return { careMapByDate: map, overdueTasksList: overdueList };
  }, [plants, currentMonthDate, todayDateStr]);

  // Selected date scheduled items
  const selectedDateCare = careMapByDate[selectedDateStr];
  const selectedDateItems = selectedDateCare ? selectedDateCare.items : [];

  // Overdue items that are pending (only shown on today's view if selected date is today)
  const isSelectedDateToday = selectedDateStr === todayDateStr;

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      
      {/* Page Header */}
      <div className="border-b border-[#5A5A40]/30 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#2D3A2D] flex items-center gap-2">
            Gestão & Agenda de Cuidados
          </h2>
          <p className="text-[#5A5A40] text-sm mt-1">
            Calendário visual mensal e próximas regas, adubações e podas calculadas automaticamente.
          </p>
        </div>

        {/* Task type filter for the lower cards */}
        <div className="flex items-center gap-1.5 bg-[#5A5A40]/15 p-1 rounded-2xl border border-[#5A5A40]/20 text-xs font-semibold self-start md:self-auto">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              filterType === 'ALL' ? 'bg-[#2D3A2D] font-bold text-[#F5F5F0] shadow-2xs' : 'text-[#5A5A40]'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => setFilterType('WATER')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
              filterType === 'WATER' ? 'bg-[#A68069] font-bold text-[#F5F5F0] shadow-2xs' : 'text-[#A68069]'
            }`}
          >
            <Droplets className="w-3.5 h-3.5" />
            Regas
          </button>
          <button
            onClick={() => setFilterType('FERTILIZE')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
              filterType === 'FERTILIZE' ? 'bg-[#5A5A40] font-bold text-[#F5F5F0] shadow-2xs' : 'text-[#5A5A40]'
            }`}
          >
            <Sprout className="w-3.5 h-3.5" />
            Adubação
          </button>
          <button
            onClick={() => setFilterType('PRUNE')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
              filterType === 'PRUNE' ? 'bg-[#D4AF37] font-bold text-[#2D3A2D] shadow-2xs' : 'text-[#2D3A2D]'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            Podas
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: MONTHLY VISUAL CALENDAR
          ========================================================================= */}
      <section className="bg-white rounded-3xl p-5 sm:p-7 border border-[#5A5A40]/20 shadow-xs space-y-5">
        
        {/* Month Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#5A5A40]/15 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#2D3A2D] text-[#D4AF37] rounded-2xl shadow-xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#2D3A2D]">
                {MONTH_NAMES[currentMonthDate.getMonth()]} de {currentMonthDate.getFullYear()}
              </h3>
              <p className="text-xs text-[#5A5A40]">
                Clique em qualquer dia para ver os detalhes e registrar tarefas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleGoToToday}
              className="px-3 py-1.5 text-xs font-bold text-[#2D3A2D] bg-[#F5F5F0] hover:bg-[#ebebe4] rounded-xl border border-[#5A5A40]/20 transition-colors"
            >
              Hoje
            </button>
            <div className="flex items-center gap-1 bg-[#F5F5F0] p-1 rounded-xl border border-[#5A5A40]/20">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg text-[#2D3A2D] hover:bg-white transition-colors"
                title="Mês anterior"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg text-[#2D3A2D] hover:bg-white transition-colors"
                title="Próximo mês"
                aria-label="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Weekday Column Headers */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
          {WEEKDAY_NAMES.map((name, idx) => (
            <div
              key={idx}
              className="text-[11px] sm:text-xs font-bold text-[#5A5A40] py-1 select-none uppercase tracking-wider"
            >
              {name}
            </div>
          ))}
        </div>

        {/* 7-Column Days Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calendarCells.map((cell) => {
            const care = careMapByDate[cell.dateStr];
            const hasWater = Boolean(care?.hasWater);
            const hasPrune = Boolean(care?.hasPrune);
            const hasFertilize = Boolean(care?.hasFertilize);
            const hasCare = hasWater || hasPrune || hasFertilize;

            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => {
                  setSelectedDateStr(cell.dateStr);
                  // If clicked padding cell outside current month, seamlessly navigate there
                  if (!cell.isCurrentMonth) {
                    const parsed = parseLocalDate(cell.dateStr);
                    setCurrentMonthDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
                  }
                }}
                className={`relative flex items-center justify-center min-h-[58px] sm:min-h-[70px] w-full rounded-2xl border transition-all text-left ${
                  cell.isSelected
                    ? 'bg-[#2D3A2D] text-white border-[#2D3A2D] shadow-md ring-2 ring-[#2D3A2D]/30'
                    : cell.isToday
                    ? 'bg-[#D4AF37]/10 text-[#2D3A2D] border-[#D4AF37] ring-2 ring-[#D4AF37]/40 font-bold'
                    : cell.isCurrentMonth
                    ? 'bg-white hover:bg-[#F5F5F0] text-[#2D3A2D] border-[#5A5A40]/15'
                    : 'bg-[#F5F5F0]/40 hover:bg-[#F5F5F0] text-[#5A5A40]/40 border-transparent'
                }`}
              >
                {/* ==============================================================
                    MANDATORY SYMBOL POSITIONING:
                    - Strictly in UPPER RIGHT CORNER of cell
                    - Aligned to the RIGHT, ABOVE the day number
                    - Side-by-side with small spacing and no overlap
                    - If no care, area is empty and number remains dead-centered
                   ============================================================== */}
                <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 flex items-center gap-0.5 sm:gap-1 pointer-events-none z-10">
                  {hasWater && (
                    <span title="Rega programada">
                      <Droplet
                        className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-colors ${
                          cell.isSelected
                            ? 'text-sky-300 fill-sky-300/40'
                            : 'text-sky-500 fill-sky-500/20'
                        }`}
                      />
                    </span>
                  )}
                  {hasPrune && (
                    <span title="Poda programada">
                      <Leaf
                        className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-colors ${
                          cell.isSelected
                            ? 'text-emerald-300 fill-emerald-300/40'
                            : 'text-emerald-600 fill-emerald-600/20'
                        }`}
                      />
                    </span>
                  )}
                  {hasFertilize && (
                    <span title="Adubação programada">
                      <Shovel
                        className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-colors ${
                          cell.isSelected
                            ? 'text-[#D4AF37] fill-[#D4AF37]/40'
                            : 'text-[#A68069] fill-[#A68069]/20'
                        }`}
                      />
                    </span>
                  )}
                </div>

                {/* Centered Day Number */}
                <span
                  className={`text-xs sm:text-sm font-semibold select-none flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full ${
                    cell.isSelected
                      ? 'text-white font-bold'
                      : cell.isToday
                      ? 'text-[#2D3A2D] font-bold'
                      : cell.isCurrentMonth
                      ? 'text-[#2D3A2D]'
                      : 'text-[#5A5A40]/40'
                  }`}
                >
                  {cell.day}
                </span>

                {/* Subtle indicator for today when not selected */}
                {cell.isToday && !cell.isSelected && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#D4AF37]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#5A5A40] pt-2 border-t border-[#5A5A40]/15">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-bold text-[#2D3A2D] text-[11px] uppercase tracking-wider">
              Legenda:
            </span>
            <div className="flex items-center gap-1.5">
              <Droplet className="w-3.5 h-3.5 text-sky-500 fill-sky-500/20" />
              <span>Rega</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Leaf className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600/20" />
              <span>Poda</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shovel className="w-3.5 h-3.5 text-[#A68069] fill-[#A68069]/20" />
              <span>Adubação</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full border border-[#D4AF37] bg-[#D4AF37]/30 inline-block" />
            <span>Hoje ({formatDisplayDate(todayDateStr)})</span>
          </div>
        </div>

      </section>

      {/* =========================================================================
          SECTION 2: SELECTED DATE DETAILS ("Cuidados para [data selecionada]")
          ========================================================================= */}
      <section className="bg-[#F5F5F0] rounded-3xl p-5 sm:p-6 border border-[#5A5A40]/20 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#5A5A40]/15 pb-3">
          <div>
            <h3 className="font-serif text-lg sm:text-xl font-bold text-[#2D3A2D] flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-[#5A5A40]" />
              Cuidados para {formatFullDate(selectedDateStr)}
            </h3>
            <p className="text-xs text-[#5A5A40] mt-0.5">
              {selectedDateItems.length === 0
                ? 'Nenhum cuidado agendado para este dia'
                : selectedDateItems.length === 1
                ? '1 cuidado previsto'
                : `${selectedDateItems.length} cuidados previstos`}
              {isSelectedDateToday && ' • Visualizando o dia de hoje'}
            </p>
          </div>

          <span className="font-mono text-xs font-bold text-[#2D3A2D] bg-white px-3 py-1.5 rounded-xl border border-[#5A5A40]/15 self-start sm:self-auto shadow-2xs">
            {formatDisplayDate(selectedDateStr)}
          </span>
        </div>

        {/* Care Tasks List for Selected Date */}
        {selectedDateItems.length === 0 ? (
          <div className="text-center py-7 px-4 bg-white/70 rounded-2xl border border-dashed border-[#5A5A40]/30 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[#5A5A40]/60 mx-auto" />
            <p className="text-sm font-semibold text-[#2D3A2D]">
              Nenhum cuidado previsto para esta data.
            </p>
            <p className="text-xs text-[#5A5A40] max-w-md mx-auto">
              Suas plantas não possuem regas, adubações ou podas programadas para {formatDisplayDate(selectedDateStr)}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedDateItems.map((item, index) => {
              return (
                <div
                  key={`${item.plant.id}-${item.taskType}-${index}`}
                  className="bg-white rounded-2xl p-4 border border-[#5A5A40]/15 shadow-xs flex flex-col justify-between gap-3 hover:border-[#5A5A40]/40 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={item.plant.photo}
                      alt={item.plant.name}
                      className="w-12 h-12 rounded-xl object-cover ring-1 ring-[#5A5A40]/20 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-serif font-bold text-[#2D3A2D] text-sm truncate">
                        {item.plant.name}
                      </h4>
                      <p className="text-[11px] text-[#5A5A40] italic font-serif truncate">
                        {item.plant.species}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {item.taskType === 'WATER' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                            <Droplet className="w-3 h-3 text-sky-500 fill-sky-500/20" />
                            Rega
                          </span>
                        )}
                        {item.taskType === 'FERTILIZE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#A68069]/10 text-[#8e6c57] border border-[#A68069]/30">
                            <Shovel className="w-3 h-3 text-[#A68069] fill-[#A68069]/20" />
                            Adubação
                          </span>
                        )}
                        {item.taskType === 'PRUNE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Leaf className="w-3 h-3 text-emerald-600 fill-emerald-600/20" />
                            Poda
                          </span>
                        )}

                        {item.isOverdue && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                            <AlertCircle className="w-2.5 h-2.5" />
                            Atrasado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions: View Plant & Log Care */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[#5A5A40]/10">
                    {onSelectPlant && (
                      <button
                        type="button"
                        onClick={() => onSelectPlant(item.plant)}
                        className="flex-1 py-1.5 px-2 bg-[#F5F5F0] hover:bg-[#ebebe4] text-[#2D3A2D] text-[11px] font-bold rounded-xl transition-colors border border-[#5A5A40]/20 text-center"
                      >
                        Ver Planta
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onLogCareTask(item.plant.id, item.taskType)}
                      className={`flex-1 py-1.5 px-2 text-white text-[11px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1 shadow-2xs ${
                        item.taskType === 'WATER'
                          ? 'bg-sky-600 hover:bg-sky-700'
                          : item.taskType === 'FERTILIZE'
                          ? 'bg-[#A68069] hover:bg-[#8e6c57]'
                          : 'bg-emerald-700 hover:bg-emerald-800'
                      }`}
                    >
                      {item.taskType === 'WATER'
                        ? 'Regar'
                        : item.taskType === 'FERTILIZE'
                        ? 'Adubar'
                        : 'Podar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* If viewing today and there are overdue tasks from earlier dates, show a quick helper */}
        {isSelectedDateToday && overdueTasksList.length > 0 && selectedDateItems.length === 0 && (
          <div className="mt-2 p-3.5 bg-amber-50/80 rounded-2xl border border-amber-200/80 flex items-start gap-2.5 text-xs text-amber-900">
            <Clock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">
                Você tem {overdueTasksList.length} cuidado{overdueTasksList.length > 1 ? 's' : ''} pendente{overdueTasksList.length > 1 ? 's' : ''} de datas anteriores.
              </p>
              <p className="text-[11px] text-amber-800/80 mt-0.5">
                Consulte os cartões abaixo para atualizar o registro de regas e adubações com facilidade.
              </p>
            </div>
          </div>
        )}

      </section>

      {/* =========================================================================
          SECTION 3: EXISTING PLANTS CARE CARDS GRID (PRESERVED IN FULL)
          ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-[#2D3A2D]">
            Visão Geral por Planta ({plants.length})
          </h3>
          <span className="text-xs text-[#5A5A40]">
            Filtro ativo: {filterType === 'ALL' ? 'Todos os cuidados' : filterType === 'WATER' ? 'Apenas regas' : filterType === 'FERTILIZE' ? 'Apenas adubação' : 'Apenas podas'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plants.map((plant) => {
            const nextWater = calculateNextCareDate(plant.careSchedule.lastWatered, plant.careSchedule.waterFrequencyDays);
            const nextFertilize = calculateNextCareDate(plant.careSchedule.lastFertilized, plant.careSchedule.fertilizeFrequencyDays);
            const nextPrune = calculateNextCareDate(plant.careSchedule.lastPruned, plant.careSchedule.pruneFrequencyDays || 90);
            const hasOverdueCare = nextWater.isOverdue || nextFertilize.isOverdue;

            return (
              <div
                key={plant.id}
                className={`bg-white rounded-3xl p-5 border shadow-xs transition-all space-y-4 ${
                  hasOverdueCare ? 'border-[#A68069] ring-2 ring-[#A68069]/30 bg-[#A68069]/5' : 'border-[#5A5A40]/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={plant.photo}
                    alt={plant.name}
                    className="w-14 h-14 rounded-2xl object-cover ring-2 ring-[#5A5A40]/20"
                  />
                  <div>
                    <h4 className="font-serif font-bold text-[#2D3A2D] text-lg">{plant.name}</h4>
                    <p className="text-xs text-[#5A5A40] italic font-serif">{plant.species}</p>
                    <span className="inline-block font-mono text-[10px] text-[#A68069] bg-[#F5F5F0] px-2.5 py-0.5 rounded-md border border-[#5A5A40]/20 font-bold mt-1">
                      {plant.rgDigital}
                    </span>
                  </div>
                </div>

                {/* Status metrics with Next Dates */}
                <div className="space-y-3 text-xs bg-[#F5F5F0] p-4 rounded-2xl border border-[#5A5A40]/15">
                  {(filterType === 'ALL' || filterType === 'WATER') && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[#5A5A40] font-medium">
                        <span className="flex items-center gap-1.5">
                          <Droplets className="w-3.5 h-3.5 text-[#A68069]" />
                          Rega (a cada {plant.careSchedule.waterFrequencyDays} dias)
                        </span>
                        <span className="text-[11px] opacity-75">Última: {formatDisplayDate(plant.careSchedule.lastWatered)}</span>
                      </div>
                      <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-[#5A5A40]/10">
                        <span className="font-bold text-[#2D3A2D]">Próxima Rega:</span>
                        <strong className={`font-mono text-xs ${nextWater.isOverdue ? 'text-red-700 font-bold' : 'text-[#A68069]'}`}>
                          {nextWater.statusText}
                        </strong>
                      </div>
                    </div>
                  )}

                  {(filterType === 'ALL' || filterType === 'FERTILIZE') && (
                    <div className="space-y-1 border-t border-[#5A5A40]/15 pt-2">
                      <div className="flex items-center justify-between text-[#5A5A40] font-medium">
                        <span className="flex items-center gap-1.5">
                          <Sprout className="w-3.5 h-3.5 text-[#5A5A40]" />
                          Adubação (a cada {plant.careSchedule.fertilizeFrequencyDays} dias)
                        </span>
                        <span className="text-[11px] opacity-75">Última: {formatDisplayDate(plant.careSchedule.lastFertilized)}</span>
                      </div>
                      <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-[#5A5A40]/10">
                        <span className="font-bold text-[#2D3A2D]">Próxima Adubação:</span>
                        <strong className={`font-mono text-xs ${nextFertilize.isOverdue ? 'text-red-700 font-bold' : 'text-emerald-800'}`}>
                          {nextFertilize.statusText}
                        </strong>
                      </div>
                    </div>
                  )}

                  {(filterType === 'ALL' || filterType === 'PRUNE') && (
                    <div className="space-y-1 border-t border-[#5A5A40]/15 pt-2">
                      <div className="flex items-center justify-between text-[#5A5A40] font-medium">
                        <span className="flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-[#D4AF37]" />
                          Poda (a cada {plant.careSchedule.pruneFrequencyDays || 90} dias)
                        </span>
                        <span className="text-[11px] opacity-75">Última: {formatDisplayDate(plant.careSchedule.lastPruned)}</span>
                      </div>
                      <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-[#5A5A40]/10">
                        <span className="font-bold text-[#2D3A2D]">Próxima Poda:</span>
                        <strong className="font-mono text-xs text-[#5A5A40]">
                          {nextPrune.formattedNextDate !== 'Não registrada' ? nextPrune.statusText : 'Não agendada'}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    onClick={() => onLogCareTask(plant.id, 'WATER')}
                    className={`py-2 px-2 text-[#F5F5F0] font-bold text-[11px] rounded-xl transition-colors flex items-center justify-center gap-1 shadow-2xs ${
                      nextWater.isOverdue ? 'bg-[#A68069] hover:bg-[#8e6c57] ring-1 ring-red-400' : 'bg-[#A68069] hover:bg-[#8e6c57]'
                    }`}
                    title="Registrar Rega"
                  >
                    <Droplets className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Regar
                  </button>

                  <button
                    onClick={() => onLogCareTask(plant.id, 'FERTILIZE')}
                    className={`py-2 px-2 text-[#F5F5F0] font-bold text-[11px] rounded-xl transition-colors flex items-center justify-center gap-1 shadow-2xs ${
                      nextFertilize.isOverdue ? 'bg-[#5A5A40] hover:bg-[#484833] ring-1 ring-amber-400' : 'bg-[#2D3A2D] hover:bg-[#1f291f]'
                    }`}
                    title="Registrar Adubação"
                  >
                    <Sprout className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Adubar
                  </button>

                  <button
                    onClick={() => onLogCareTask(plant.id, 'PRUNE')}
                    className="py-2 px-2 bg-[#5A5A40] hover:bg-[#484833] text-[#F5F5F0] font-bold text-[11px] rounded-xl transition-colors flex items-center justify-center gap-1 shadow-2xs"
                    title="Registrar Poda de Manutenção"
                  >
                    <Scissors className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Podar
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
