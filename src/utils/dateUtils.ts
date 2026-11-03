export interface NextCareStatus {
  nextDateStr: string; // YYYY-MM-DD
  formattedNextDate: string; // DD/MM/YYYY
  daysRemaining: number;
  statusText: string;
  isOverdue: boolean;
  isDueToday: boolean;
}

/**
 * Returns today's calendar date in user's local timezone as YYYY-MM-DD.
 * Avoids any timezone shift caused by toISOString() which standardizes to UTC.
 */
export function getLocalTodayDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Safely parses a YYYY-MM-DD date string into a local Date at 00:00:00.
 * Avoids any timezone shift caused by new Date("YYYY-MM-DD") which interprets as UTC midnight.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr || typeof dateStr !== 'string') return new Date(NaN);
  const parts = dateStr.trim().split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, 0, 0, 0, 0);
  }
  const fallback = new Date(dateStr);
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

/**
 * Formats a YYYY-MM-DD string into Brazilian display format DD/MM/AAAA.
 */
export function formatDisplayDate(dateStr: string | undefined): string {
  if (!dateStr) return 'Não registrada';
  const parts = dateStr.trim().split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Calculates the next care date based on last care date string and frequency in days.
 * Performs pure calendar arithmetic to prevent any daylight saving or hour drift.
 */
export function calculateNextCareDate(
  lastDateStr: string | undefined,
  frequencyDays: number = 7
): NextCareStatus {
  if (!lastDateStr) {
    return {
      nextDateStr: '',
      formattedNextDate: 'Não registrada',
      daysRemaining: 0,
      statusText: 'Pendente',
      isOverdue: false,
      isDueToday: false,
    };
  }

  const lastDate = parseLocalDate(lastDateStr);

  if (isNaN(lastDate.getTime())) {
    return {
      nextDateStr: '',
      formattedNextDate: 'Inválida',
      daysRemaining: 0,
      statusText: 'Inválida',
      isOverdue: false,
      isDueToday: false,
    };
  }

  const safeFrequency = Math.max(1, frequencyDays || 7);

  // Pure calendar arithmetic: add safeFrequency to local day of month
  const nextDate = new Date(
    lastDate.getFullYear(),
    lastDate.getMonth(),
    lastDate.getDate() + safeFrequency,
    0,
    0,
    0,
    0
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calendar day diff using UTC timestamps of the pure calendar year/month/day
  // to avoid any DST 23h/25h division artifacts.
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const utcNext = Date.UTC(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
  const daysRemaining = Math.round((utcNext - utcToday) / (1000 * 60 * 60 * 24));

  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, '0');
  const day = String(nextDate.getDate()).padStart(2, '0');

  const nextDateStr = `${year}-${month}-${day}`;
  const formattedNextDate = `${day}/${month}/${year}`;

  const isDueToday = daysRemaining === 0;
  const isOverdue = daysRemaining <= 0;

  let statusText = '';
  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    statusText = `Atrasado (${overdueDays} ${overdueDays === 1 ? 'dia' : 'dias'}) • ${day}/${month}`;
  } else if (daysRemaining === 0) {
    statusText = `Hoje! (${day}/${month})`;
  } else if (daysRemaining === 1) {
    statusText = `Amanhã (${day}/${month})`;
  } else {
    statusText = `${day}/${month} (em ${daysRemaining} dias)`;
  }

  return {
    nextDateStr,
    formattedNextDate,
    daysRemaining,
    statusText,
    isOverdue,
    isDueToday,
  };
}

/**
 * Calculates calendar days elapsed since the given care date (e.g. last watered).
 * Avoids hours/timezone drift by calculating calendar day differences.
 */
export function getDaysSinceLastCare(lastDateStr: string | undefined): { days: number; text: string } {
  if (!lastDateStr) {
    return { days: -1, text: 'Nunca registrado' };
  }
  const lastDate = parseLocalDate(lastDateStr);
  if (isNaN(lastDate.getTime())) {
    return { days: -1, text: 'Data inválida' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const utcLast = Date.UTC(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
  const days = Math.round((utcToday - utcLast) / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return { days: 0, text: 'Hoje' };
  }
  if (days === 1) {
    return { days: 1, text: 'Ontem (há 1 dia)' };
  }
  if (days > 1) {
    return { days, text: `Há ${days} dias` };
  }
  return { days, text: 'Data futura' };
}
