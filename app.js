// VERSÃO BLINDADA - NÃO QUEBRA
(function () {
  const {
    getSession,
    saveSession,
    clearSession,
    getFinanceData,
    formatCurrency,
    formatDateBR,
    formatDateTimeBR,
    escapeHtml
  } = window.FinanceiroUtils;

  const CREDENTIALS = {
    admin: { password: 'admin123', role: 'admin', redirect: 'admin.html' },
    usuario: { password: '123', role: 'usuario', redirect: 'dashboard.html' }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;

    if (page === 'login') initLogin();
    if (page === 'admin') ensureAuthorized('admin');
    if (page === 'dashboard') initDashboard();

    setupLogout();
  });

  // ================= LOGIN =================
  function initLogin() {
    const session = getSession();
    if (session?.role === 'admin') return (window.location.href = 'admin.html');
    if (session?.role === 'usuario') return (window.location.href = 'dashboard.html');

    const form = document.getElementById('loginForm');
    const message = document.getElementById('loginMessage');

    form?.addEventListener('submit', (e) => {
      e.preventDefault();

      const username = document.getElementById('username')?.value?.toLowerCase();
      const password = document.getElementById('password')?.value;

      const cred = CREDENTIALS[username];

      if (!cred || cred.password !== password) {
        message.textContent = 'Usuário ou senha inválidos';
        return;
      }

      saveSession({ username, role: cred.role });
      window.location.href = cred.redirect;
    });
  }

  // ================= DASHBOARD =================
  function initDashboard() {
    const session = ensureAuthorized();
    const payload = getFinanceData();

    if (!payload || !payload.tables) {
      document.getElementById('dashboardEmptyState')?.classList.add('is-visible');
      return;
    }

    document.getElementById('sessionRoleLabel').textContent =
      session.role === 'admin' ? 'Administrador' : 'Usuário';

    document.getElementById('dashboardUpdatedAt').textContent =
      'Atualizado em ' + formatDateTimeBR(payload.updatedAt);

    renderResumo(payload);
  }

  function renderResumo(payload) {
    const cards = [
      {
        label: 'Faturamento',
        value: formatCurrency(sum(payload.tables.tb_projecoes, 'faturamento_realizado')),
        accent: true
      },
      {
        label: 'A Receber',
        value: formatCurrency(sum(payload.tables.tb_a_receber, 'saldo'))
      },
      {
        label: 'Inadimplentes',
        value: formatCurrency(sum(payload.tables.tb_inadimplentes, 'saldo'))
      }
    ];

    const container = document.getElementById('dashboardCards');
    if (!container) return;

    container.innerHTML = cards
      .map(
        (c) => `
      <article class="stat-card premium-kpi ${c.accent ? 'accent' : ''}">
        <span>${c.label}</span>
        <strong>${c.value}</strong>
      </article>`
      )
      .join('');
  }

  function sum(rows = [], field) {
    return rows.reduce((t, r) => t + Number(r[field] || 0), 0);
  }

  // ================= AUTH =================
  function ensureAuthorized(role) {
    const session = getSession();

    if (!session) {
      window.location.href = 'index.html';
      return null;
    }

    if (role && session.role !== role) {
      window.location.href = 'dashboard.html';
      return null;
    }

    return session;
  }

  function setupLogout() {
    document.getElementById('logoutButton')?.addEventListener('click', () => {
      clearSession();
      window.location.href = 'index.html';
    });
  }
})();
