const DEVHUB_SETTINGS_KEY = 'coachpad_devhub_settings';

export function getAgeMethod() {
  try { return JSON.parse(localStorage.getItem(DEVHUB_SETTINGS_KEY) || '{}').ageMethod || 'dec31'; }
  catch { return 'dec31'; }
}

// Age today
export function calcAgeToday(dob) {
  if (!dob) return null;
  const b = new Date(dob + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

// Age as of Dec 31 of current year (Australian basketball standard)
export function calcAgeDec31(dob) {
  if (!dob) return null;
  const b = new Date(dob + 'T00:00:00');
  return new Date().getFullYear() - b.getFullYear();
}

// Returns age using the given method (or reads from localStorage if not provided)
export function calcAge(dob, method) {
  const m = method ?? getAgeMethod();
  return m === 'dec31' ? calcAgeDec31(dob) : calcAgeToday(dob);
}

// Returns a label suffix to show next to age
export function ageSuffix(method) {
  const m = method ?? getAgeMethod();
  return m === 'dec31' ? ' (as at 31 Dec)' : '';
}
