
export const toYYYYMMDD = (date: Date): string => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

export const getTodayYYYYMMDD = (): string => {
  return toYYYYMMDD(new Date());
};

export const getTomorrowYYYYMMDD = (): string => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toYYYYMMDD(tomorrow);
};

export const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
};

export const getStartOfMonth = (date: Date): Date => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
};

export const getNextDayOfWeek = (dayIndex: number): string => {
    const today = new Date();
    const currentDay = today.getDay();
    let daysUntil = dayIndex - currentDay;
    if (daysUntil <= 0) {
        daysUntil += 7;
    }
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntil);
    return toYYYYMMDD(nextDate);
};

export const formatDisplayDate = (dateStr: string): string => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  // Parse YYYY-MM-DD manually to avoid UTC conversion issues in display
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  
  if (toYYYYMMDD(today) === dateStr) {
    return 'Today';
  }
  if (toYYYYMMDD(tomorrow) === dateStr) {
    return 'Tomorrow';
  }
  
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric'
  };

  // Only show year if it's not the current year
  if (year !== currentYear) {
      options.year = 'numeric';
  }
  
  return date.toLocaleDateString(undefined, options);
};
