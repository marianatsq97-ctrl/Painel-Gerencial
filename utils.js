(function () {
  const STORAGE_KEYS = {
    session: 'aa_finance_session',
    financeData: 'financeData'
  };

  const REQUIRED_SHEET = 'Cálculos de Projeção';
  const VALID_EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv'];

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseBrazilianNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    let sanitized = String(value).trim();
    if (!sanitized) return 0;

    sanitized = sanitized.replace(/R\$/gi, '').replace(/\s/g, '');

    const hasComma = sanitized.includes(',');
    const hasDot = sanitized.includes('.');

    if (hasComma && hasDot) {
      sanitized = sanitized.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
      sanitized = sanitized.replace(',', '.');
    }

    sanitized = sanitized.replace(/[^0-9.-]/g, '');
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function excelDateToJSDate(serial) {
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = serial - Math.floor(serial) + 0.0000001;
    let totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;
    return new Date(dateInfo.getUTCFullYear(), dateInfo.getUTCMonth(), dateInfo.getUTCDate(), hours, minutes, seconds);
  }

  function parseDate(value) {
    if (!value && value !== 0) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'number' && Number.isFinite(value) && value > 59) return excelDateToJSDate(value);

    const raw = String(value).trim();
    if (!raw) return null;

    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)) {
      const [day, month, year] = raw.split('/').map(Number);
      const normalizedYear = year < 100 ? 2000 + year : year;
      const date = new Date(normalizedYear, month - 1, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const isoDate = new Date(raw);
    return Number.isNaN(isoDate.getTime()) ? null : isoDate;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(value || 0));
  }

  function formatDateBR(value) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) return '-';
    return new Intl.DateTimeFormat('pt-BR').format(date);
  }

  function formatDateTimeBR(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!date || Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date);
  }

  function saveSession(session) {
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || 'null');
    } catch (error) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEYS.session);
  }

  function saveFinanceData(payload) {
    localStorage.setItem(STORAGE_KEYS.financeData, JSON.stringify(payload));
  }

  function getFinanceData() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.financeData) || localStorage.getItem('aa_finance_data') || 'null');
    } catch (error) {
      return null;
    }
  }

  function clearFinanceData() {
    localStorage.removeItem(STORAGE_KEYS.financeData);
    localStorage.removeItem('aa_finance_data');
  }

  window.FinanceiroUtils = {
    STORAGE_KEYS,
    REQUIRED_SHEET,
    VALID_EXTENSIONS,
    escapeHtml,
    formatCurrency,
    formatDateBR,
    formatDateTimeBR,
    clearFinanceData,
    getFinanceData,
    getSession,
    normalizeText,
    parseBrazilianNumber,
    parseDate,
    saveFinanceData,
    saveSession,
    clearSession
  };
})();
