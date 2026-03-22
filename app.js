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
    admin: { password: 'admin123', role: 'admin' },
    usuario: { password: '123', role: 'usuario' }
  };

  const PANEL_META = {
    faturamento: {
      title: 'Painel de Projeções e Faturamento',
      subtitle: 'Volume realizado, metas e faturamento por unidade de negócio.',
      note: 'Clique em uma barra ou ponto do gráfico para filtrar por unidade.',
      linksLabel: 'Projeções e faturamento'
    },
    receber: {
      title: 'Painel de Contas a Receber',
      subtitle: 'Carteira futura por cliente e portador com visão gerencial.',
      note: 'Clique em uma barra do gráfico para filtrar por cliente ou portador.',
      linksLabel: 'A receber'
    },
    inadimplentes: {
      title: 'Painel de Inadimplentes',
      subtitle: 'Valores vencidos por cliente e por faixa de atraso.',
      note: 'Clique em uma barra do gráfico para filtrar por cliente ou faixa.',
      linksLabel: 'Inadimplentes'
    }
  };

  const state = {
    payload: null,
    panel: 'faturamento',
    clickedPrimary: null,
    filters: {
      primary: 'todos',
      secondary: 'todos',
      tertiary: 'todos'
    },
    charts: {
      primary: null,
      secondary: null
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;

    if (page === 'login') initLogin();
    if (page === 'portal') initPortal();
    if (page === 'admin') ensureAuthorized('admin');
    if (page === 'dashboard') initDashboard();

    setupLogout();
  });

  function initLogin() {
    const session = getSession();
    if (session) {
      window.location.replace('portal.html');
      return;
    }

    const form = document.getElementById('loginForm');
    const message = document.getElementById('loginMessage');

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const username = String(document.getElementById('username')?.value || '').trim().toLowerCase();
      const password = String(document.getElementById('password')?.value || '');
      const credential = CREDENTIALS[username];

      if (!credential || credential.password !== password) {
        if (message) message.textContent = 'Usuário ou senha inválidos.';
        return;
      }

      saveSession({ username, role: credential.role, loginAt: new Date().toISOString() });
      window.location.href = 'portal.html';
    });
  }

  function initPortal() {
    const session = ensureAuthorized();
    if (!session) return;

    const profile = document.getElementById('portalProfileLabel');
    const adminLink = document.getElementById('portalAdminLink');

    if (profile) {
      profile.textContent = session.role === 'admin' ? 'Perfil: Administrador' : 'Perfil: Usuário';
    }

    if (adminLink && session.role === 'admin') {
      adminLink.classList.remove('is-hidden');
    }
  }

  function initDashboard() {
    const session = ensureAuthorized();
    if (!session) return;

    state.payload = getFinanceData();
    state.panel = getRequestedPanel();
    highlightPanelLinks(state.panel);

    const adminLink = document.getElementById('dashboardAdminLink');
    if (adminLink && session.role === 'admin') {
      adminLink.classList.remove('is-hidden');
    }

    const emptyState = document.getElementById('dashboardEmptyState');
    if (!state.payload?.tables) {
      emptyState?.classList.remove('is-hidden');
      return;
    }

    emptyState?.classList.add('is-hidden');
    bindDashboardEvents();
    updateDashboard();
  }

  function bindDashboardEvents() {
    document.getElementById('filterPrimary')?.addEventListener('change', (event) => {
      state.filters.primary = event.target.value;
      state.clickedPrimary = null;
      updateDashboard();
    });

    document.getElementById('filterSecondary')?.addEventListener('change', (event) => {
      state.filters.secondary = event.target.value;
      state.clickedPrimary = null;
      updateDashboard();
    });

    document.getElementById('filterTertiary')?.addEventListener('change', (event) => {
      state.filters.tertiary = event.target.value;
      updateDashboard();
    });

    document.getElementById('btnLimpar')?.addEventListener('click', () => {
      state.filters.primary = 'todos';
      state.filters.secondary = 'todos';
      state.filters.tertiary = 'todos';
      state.clickedPrimary = null;
      setSelectValue('filterPrimary', 'todos');
      setSelectValue('filterSecondary', 'todos');
      setSelectValue('filterTertiary', 'todos');
      updateDashboard();
    });
  }

  function updateDashboard() {
    const meta = PANEL_META[state.panel];
    setText('dashboardTitle', meta.title);
    setText('dashboardSubtitle', meta.subtitle);
    setText('footerNote', meta.note);

    if (state.panel === 'receber') {
      renderReceber();
      return;
    }

    if (state.panel === 'inadimplentes') {
      renderInadimplentes();
      return;
    }

    renderFaturamento();
  }

  function renderFaturamento() {
    const rows = state.payload?.tables?.tb_projecoes || [];
    const periods = unique(rows.map((row) => row.periodo).filter(Boolean)).sort().reverse();
    const unidades = unique(rows.map((row) => row.unidade).filter(Boolean)).sort(localeSort);
    const tipos = ['todos', 'quantidade', 'faturamento'];

    fillSelect('filterPrimary', 'filterPrimaryLabel', 'Filtro por Data', periods, state.filters.primary, 'Todas as datas');
    fillSelect('filterSecondary', 'filterSecondaryLabel', 'Filtro por Unidade', unidades, state.filters.secondary, 'Todas as unidades');
    fillSelect('filterTertiary', 'filterTertiaryLabel', 'Filtro por Tipo', tipos, state.filters.tertiary, 'Todos');

    const filtered = rows.filter((row) => {
      const periodOk = state.filters.primary === 'todos' || row.periodo === state.filters.primary;
      const selectedUnit = state.clickedPrimary || state.filters.secondary;
      const unitOk = selectedUnit === 'todos' || row.unidade === selectedUnit;
      return periodOk && unitOk;
    });

    const aggregated = aggregateFaturamento(filtered);
    const totals = aggregated.reduce((accumulator, item) => ({
      volumeRealizado: accumulator.volumeRealizado + item.volumeRealizado,
      volumeProjetado: accumulator.volumeProjetado + item.volumeProjetado,
      faturamentoRealizado: accumulator.faturamentoRealizado + item.faturamentoRealizado,
      faturamentoProjetado: accumulator.faturamentoProjetado + item.faturamentoProjetado,
      arquivos: accumulator.arquivos
    }), {
      volumeRealizado: 0,
      volumeProjetado: 0,
      faturamentoRealizado: 0,
      faturamentoProjetado: 0,
      arquivos: state.payload?.processedFiles?.length || 0
    });

    const volumePercent = totals.volumeProjetado ? (totals.volumeRealizado / totals.volumeProjetado) * 100 : 0;
    const faturamentoPercent = totals.faturamentoProjetado ? (totals.faturamentoRealizado / totals.faturamentoProjetado) * 100 : 0;

    renderMiniCards([
      { label: 'Arquivos', value: totals.arquivos },
      { label: 'tb_projecoes', value: filtered.length },
      { label: 'Unidades', value: aggregated.length },
      { label: 'Períodos', value: unique(filtered.map((row) => row.periodo).filter(Boolean)).length },
      {
        label: 'Filtro ativo',
        value: state.clickedPrimary || (state.filters.secondary !== 'todos' ? state.filters.secondary : 'Todos')
      }
    ]);

    renderBigCards([
      { title: 'Volume realizado', value: formatCompactNumber(totals.volumeRealizado), subbar: `${formatPercent(volumePercent)} da meta`, tone: 'green' },
      { title: 'Meta de volume', value: formatCompactNumber(totals.volumeProjetado), subbar: `${formatCompactNumber(totals.volumeProjetado)} m³`, tone: 'green' },
      { title: 'Faturamento realizado', value: formatCurrency(totals.faturamentoRealizado), subbar: `${formatCurrency(totals.faturamentoProjetado - totals.faturamentoRealizado)} abaixo da meta`, tone: 'orange' },
      { title: 'Meta de faturamento', value: formatCurrency(totals.faturamentoProjetado), subbar: formatPercent(faturamentoPercent), tone: 'blue' }
    ]);

    renderDualBarLineCharts({
      primaryTitle: 'Comparação de <span class="orange">Volume</span>',
      secondaryTitle: 'Comparação de <span class="blue">Faturamento</span>',
      labels: aggregated.map((item) => item.unidade),
      primaryBarsA: aggregated.map((item) => item.volumeRealizado),
      primaryBarsB: aggregated.map((item) => item.volumeProjetado),
      primaryLine: aggregated.map((item) => item.volumePercentual),
      secondaryBarsA: aggregated.map((item) => item.faturamentoRealizado),
      secondaryBarsB: aggregated.map((item) => item.faturamentoProjetado),
      secondaryLine: aggregated.map((item) => item.faturamentoPercentual),
      primaryMode: 'number',
      secondaryMode: 'money',
      primarySummary: [
        { label: 'Volume realizado', value: `${formatCompactNumber(totals.volumeRealizado)} m³`, className: 'accent' },
        { label: 'Meta de volume', value: `${formatCompactNumber(totals.volumeProjetado)} m³`, className: 'green-txt' },
        { label: '% atingido', value: formatPercent(volumePercent), className: 'green-txt' }
      ],
      secondarySummary: [
        { label: 'Faturamento realizado', value: formatCurrency(totals.faturamentoRealizado), className: 'accent' },
        { label: 'Meta de faturamento', value: formatCurrency(totals.faturamentoProjetado), className: 'blue-txt' },
        { label: '% atingido', value: formatPercent(faturamentoPercent), className: 'blue-txt' }
      ]
    });

    renderTable('Primary', 'Quantidade', [
      'Unidade de Negócio',
      'Volume Realizado',
      'Volume Médio / Dia',
      'Volume Projetado',
      'Diferença',
      '% Atingido'
    ], aggregated.map((item) => [
      escapeHtml(item.unidade),
      numericCell(formatCompactNumber(item.volumeRealizado)),
      numericCell(formatCompactNumber(item.volumeMedio)),
      numericCell(formatCompactNumber(item.volumeProjetado), 'green-txt'),
      numericCell(formatCompactNumber(item.volumeRealizado - item.volumeProjetado), item.volumeRealizado - item.volumeProjetado < 0 ? 'danger-txt' : 'green-txt'),
      numericCell(formatPercent(item.volumePercentual), 'accent')
    ]));

    renderTable('Secondary', 'Faturamento', [
      'Unidade de Negócio',
      'Faturamento Realizado',
      'Faturamento Médio / Dia',
      'Faturamento Projetado',
      'Diferença',
      '% Atingido'
    ], aggregated.map((item) => [
      escapeHtml(item.unidade),
      numericCell(formatCurrency(item.faturamentoRealizado)),
      numericCell(formatCurrency(item.faturamentoMedio)),
      numericCell(formatCurrency(item.faturamentoProjetado), 'blue-txt'),
      numericCell(formatCurrency(item.faturamentoRealizado - item.faturamentoProjetado), item.faturamentoRealizado - item.faturamentoProjetado < 0 ? 'danger-txt' : 'green-txt'),
      numericCell(formatPercent(item.faturamentoPercentual), 'accent')
    ]));

    togglePanelSections(state.filters.tertiary);
  }

  function renderReceber() {
    const rows = state.payload?.tables?.tb_a_receber || [];
    const clientes = unique(rows.map((row) => row.cliente).filter(Boolean)).sort(localeSort);
    const portadores = unique(rows.map((row) => row.portador).filter(Boolean)).sort(localeSort);
    const modos = ['todos', 'cliente', 'portador'];

    fillSelect('filterPrimary', 'filterPrimaryLabel', 'Filtro por Cliente', clientes, state.filters.primary, 'Todos os clientes');
    fillSelect('filterSecondary', 'filterSecondaryLabel', 'Filtro por Portador', portadores, state.filters.secondary, 'Todos os portadores');
    fillSelect('filterTertiary', 'filterTertiaryLabel', 'Filtro por Visão', modos, state.filters.tertiary, 'Todos');

    const filtered = rows.filter((row) => {
      const clienteRef = state.clickedPrimary || state.filters.primary;
      const clienteOk = clienteRef === 'todos' || row.cliente === clienteRef;
      const portadorOk = state.filters.secondary === 'todos' || row.portador === state.filters.secondary;
      return clienteOk && portadorOk;
    });

    const byCliente = aggregateByKey(filtered, 'cliente', 'saldo');
    const byPortador = aggregateByKey(filtered, 'portador', 'saldo');
    const total = sum(filtered, 'saldo');

    renderMiniCards([
      { label: 'Arquivos', value: state.payload?.processedFiles?.length || 0 },
      { label: 'tb_a_receber', value: filtered.length },
      { label: 'Clientes', value: byCliente.length },
      { label: 'Portadores', value: byPortador.length },
      { label: 'Títulos', value: filtered.length }
    ]);

    renderBigCards([
      { title: 'Total a receber', value: formatCurrency(total), subbar: `${byCliente.length} clientes`, tone: 'green' },
      { title: 'Ticket médio', value: formatCurrency(filtered.length ? total / filtered.length : 0), subbar: `${filtered.length} títulos`, tone: 'green' },
      { title: 'Maior cliente', value: formatCurrency(byCliente[0]?.value || 0), subbar: escapeHtml(byCliente[0]?.label || 'Sem cliente'), tone: 'orange' },
      { title: 'Maior portador', value: formatCurrency(byPortador[0]?.value || 0), subbar: escapeHtml(byPortador[0]?.label || 'Sem portador'), tone: 'blue' }
    ]);

    renderDualBarCharts({
      primaryTitle: 'Carteira por <span class="orange">Cliente</span>',
      secondaryTitle: 'Carteira por <span class="blue">Portador</span>',
      primaryLabels: byCliente.slice(0, 8).map((item) => item.label),
      primaryValues: byCliente.slice(0, 8).map((item) => item.value),
      secondaryLabels: byPortador.slice(0, 8).map((item) => item.label),
      secondaryValues: byPortador.slice(0, 8).map((item) => item.value),
      mode: 'money',
      primarySummary: [
        { label: 'Total carteira', value: formatCurrency(total), className: 'accent' },
        { label: 'Clientes', value: String(byCliente.length), className: 'green-txt' },
        { label: 'Portadores', value: String(byPortador.length), className: 'green-txt' }
      ],
      secondarySummary: [
        { label: 'Maior cliente', value: formatCurrency(byCliente[0]?.value || 0), className: 'accent' },
        { label: 'Maior portador', value: formatCurrency(byPortador[0]?.value || 0), className: 'blue-txt' },
        { label: 'Títulos', value: String(filtered.length), className: 'blue-txt' }
      ]
    });

    renderTable('Primary', 'Títulos por cliente', [
      'Cliente',
      'Valor total',
      'Qtd. títulos'
    ], groupRows(filtered, 'cliente').map((item) => [
      escapeHtml(item.label),
      numericCell(formatCurrency(item.total), 'accent'),
      numericCell(String(item.count))
    ]));

    renderTable('Secondary', 'Títulos por portador', [
      'Portador',
      'Valor total',
      'Qtd. títulos'
    ], groupRows(filtered, 'portador').map((item) => [
      escapeHtml(item.label),
      numericCell(formatCurrency(item.total), 'blue-txt'),
      numericCell(String(item.count))
    ]));

    togglePanelSections(state.filters.tertiary === 'cliente' ? 'quantidade' : state.filters.tertiary === 'portador' ? 'faturamento' : 'todos');
  }

  function renderInadimplentes() {
    const rows = state.payload?.tables?.tb_inadimplentes || [];
    const clientes = unique(rows.map((row) => row.cliente).filter(Boolean)).sort(localeSort);
    const faixas = unique(rows.map((row) => row.faixa_atraso).filter(Boolean)).sort(localeSort);
    const modos = ['todos', 'cliente', 'faixa'];

    fillSelect('filterPrimary', 'filterPrimaryLabel', 'Filtro por Cliente', clientes, state.filters.primary, 'Todos os clientes');
    fillSelect('filterSecondary', 'filterSecondaryLabel', 'Filtro por Faixa', faixas, state.filters.secondary, 'Todas as faixas');
    fillSelect('filterTertiary', 'filterTertiaryLabel', 'Filtro por Visão', modos, state.filters.tertiary, 'Todos');

    const filtered = rows.filter((row) => {
      const clienteRef = state.clickedPrimary || state.filters.primary;
      const clienteOk = clienteRef === 'todos' || row.cliente === clienteRef;
      const faixaOk = state.filters.secondary === 'todos' || row.faixa_atraso === state.filters.secondary;
      return clienteOk && faixaOk;
    });

    const byCliente = aggregateByKey(filtered, 'cliente', 'saldo');
    const byFaixa = aggregateByKey(filtered, 'faixa_atraso', 'saldo');
    const total = sum(filtered, 'saldo');

    renderMiniCards([
      { label: 'Arquivos', value: state.payload?.processedFiles?.length || 0 },
      { label: 'tb_inadimplentes', value: filtered.length },
      { label: 'Clientes', value: byCliente.length },
      { label: 'Faixas', value: byFaixa.length },
      { label: 'Ticket médio', value: formatCurrency(filtered.length ? total / filtered.length : 0) }
    ]);

    renderBigCards([
      { title: 'Total inadimplente', value: formatCurrency(total), subbar: `${byCliente.length} clientes`, tone: 'green' },
      { title: 'Ticket médio', value: formatCurrency(filtered.length ? total / filtered.length : 0), subbar: `${filtered.length} títulos`, tone: 'green' },
      { title: 'Maior cliente', value: formatCurrency(byCliente[0]?.value || 0), subbar: escapeHtml(byCliente[0]?.label || 'Sem cliente'), tone: 'orange' },
      { title: 'Faixa crítica', value: formatCurrency(byFaixa[0]?.value || 0), subbar: escapeHtml(byFaixa[0]?.label || 'Sem faixa'), tone: 'blue' }
    ]);

    renderDualBarCharts({
      primaryTitle: 'Inadimplência por <span class="orange">Cliente</span>',
      secondaryTitle: 'Inadimplência por <span class="blue">Faixa</span>',
      primaryLabels: byCliente.slice(0, 8).map((item) => item.label),
      primaryValues: byCliente.slice(0, 8).map((item) => item.value),
      secondaryLabels: byFaixa.slice(0, 8).map((item) => item.label),
      secondaryValues: byFaixa.slice(0, 8).map((item) => item.value),
      mode: 'money',
      primarySummary: [
        { label: 'Total vencido', value: formatCurrency(total), className: 'accent' },
        { label: 'Clientes', value: String(byCliente.length), className: 'green-txt' },
        { label: 'Faixas', value: String(byFaixa.length), className: 'green-txt' }
      ],
      secondarySummary: [
        { label: 'Maior cliente', value: formatCurrency(byCliente[0]?.value || 0), className: 'accent' },
        { label: 'Faixa crítica', value: formatCurrency(byFaixa[0]?.value || 0), className: 'blue-txt' },
        { label: 'Títulos', value: String(filtered.length), className: 'blue-txt' }
      ]
    });

    renderTable('Primary', 'Inadimplência por cliente', [
      'Cliente',
      'Valor total',
      'Qtd. títulos'
    ], groupRows(filtered, 'cliente').map((item) => [
      escapeHtml(item.label),
      numericCell(formatCurrency(item.total), 'accent'),
      numericCell(String(item.count))
    ]));

    renderTable('Secondary', 'Inadimplência por faixa', [
      'Faixa',
      'Valor total',
      'Qtd. títulos'
    ], groupRows(filtered, 'faixa_atraso').map((item) => [
      escapeHtml(item.label),
      numericCell(formatCurrency(item.total), 'blue-txt'),
      numericCell(String(item.count))
    ]));

    togglePanelSections(state.filters.tertiary === 'cliente' ? 'quantidade' : state.filters.tertiary === 'faixa' ? 'faturamento' : 'todos');
  }

  function renderMiniCards(items) {
    const labels = ['miniLabel1', 'miniLabel2', 'miniLabel3', 'miniLabel4'];
    const values = ['miniValue1', 'miniValue2', 'miniValue3', 'miniValue4'];
    setText('miniArquivos', String(items[0]?.value ?? 0));
    labels.forEach((id, index) => setText(id, items[index + 1]?.label || '-'));
    values.forEach((id, index) => setText(id, String(items[index + 1]?.value ?? 0)));
  }

  function renderBigCards(cards) {
    const container = document.getElementById('bigCardsRow');
    if (!container) return;
    container.innerHTML = cards.map((card) => `
      <div class="big-card bg-${escapeHtml(card.tone)}">
        <div class="title">${escapeHtml(card.title)}</div>
        <div class="value">${escapeHtml(card.value)}</div>
        <div class="subbar">${escapeHtml(card.subbar)}</div>
      </div>
    `).join('');
  }

  function renderDualBarLineCharts(config) {
    setHtml('chartPrimaryTitle', config.primaryTitle);
    setHtml('chartSecondaryTitle', config.secondaryTitle);
    renderSummary('chartPrimarySummary', config.primarySummary);
    renderSummary('chartSecondarySummary', config.secondarySummary);

    createChart('primary', 'chartPrimary', {
      labels: config.labels,
      datasets: [
        makeBarDataset('Realizado', config.primaryBarsA, 'rgba(255, 122, 26, 0.82)', config.primaryMode),
        makeBarDataset('Meta', config.primaryBarsB, 'rgba(158, 227, 125, 0.76)', config.primaryMode),
        makeLineDataset('% Atingido', config.primaryLine, '#c4f3af')
      ]
    }, config.primaryMode);

    createChart('secondary', 'chartSecondary', {
      labels: config.labels,
      datasets: [
        makeBarDataset('Realizado', config.secondaryBarsA, 'rgba(255, 122, 26, 0.82)', config.secondaryMode),
        makeBarDataset('Meta', config.secondaryBarsB, 'rgba(120, 201, 255, 0.78)', config.secondaryMode),
        makeLineDataset('% Atingido', config.secondaryLine, '#9bd9ff')
      ]
    }, config.secondaryMode);
  }

  function renderDualBarCharts(config) {
    setHtml('chartPrimaryTitle', config.primaryTitle);
    setHtml('chartSecondaryTitle', config.secondaryTitle);
    renderSummary('chartPrimarySummary', config.primarySummary);
    renderSummary('chartSecondarySummary', config.secondarySummary);

    createChart('primary', 'chartPrimary', {
      labels: config.primaryLabels,
      datasets: [makeBarDataset('Valor', config.primaryValues, 'rgba(255, 122, 26, 0.82)', config.mode)]
    }, config.mode);

    createChart('secondary', 'chartSecondary', {
      labels: config.secondaryLabels,
      datasets: [makeBarDataset('Valor', config.secondaryValues, 'rgba(120, 201, 255, 0.78)', config.mode)]
    }, config.mode);
  }

  function createChart(slot, canvasId, data, mode) {
    if (!window.Chart) return;
    if (window.ChartDataLabels) {
      window.Chart.register(window.ChartDataLabels);
    }

    state.charts[slot]?.destroy();
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    state.charts[slot] = new window.Chart(canvas, {
      type: 'bar',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (_, elements, chart) => {
          if (!elements?.length) return;
          const label = chart.data.labels[elements[0].index];
          state.clickedPrimary = state.clickedPrimary === label ? null : label;
          updateDashboard();
        },
        plugins: {
          legend: {
            labels: {
              color: '#f5f7ff',
              font: { weight: '700' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(11,16,32,0.96)',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            titleColor: '#fff',
            bodyColor: '#dfe7ff',
            callbacks: {
              label(context) {
                if (context.dataset.type === 'line') {
                  return `${context.dataset.label}: ${formatPercent(context.raw)}`;
                }
                return `${context.dataset.label}: ${mode === 'money' ? formatCurrency(context.raw) : formatCompactNumber(context.raw)}`;
              }
            }
          },
          datalabels: {
            display(context) {
              return context.dataset.type !== 'line';
            },
            color: '#ffffff',
            anchor: 'end',
            align: 'top',
            offset: 2,
            clamp: true,
            font: { weight: '700', size: 10 },
            formatter(value, context) {
              if (context.dataset.type === 'line') return formatPercent(value);
              return mode === 'money' ? compactCurrency(value) : compactNumber(value);
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#d1d9ef', font: { size: 11 } },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#d1d9ef',
              callback(value) {
                return mode === 'money' ? compactCurrency(value) : compactNumber(value);
              }
            },
            grid: { color: 'rgba(255,255,255,0.08)' }
          },
          y1: {
            position: 'right',
            beginAtZero: true,
            display: data.datasets.some((dataset) => dataset.type === 'line'),
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#9bd9ff',
              callback(value) {
                return `${value}%`;
              }
            }
          }
        }
      }
    });
  }

  function renderTable(suffix, title, headers, rows) {
    setText(`table${suffix}Title`, title);
    const thead = document.getElementById(`thead${suffix}`);
    const tbody = document.getElementById(`tbody${suffix}`);
    if (!thead || !tbody) return;

    thead.innerHTML = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
    tbody.innerHTML = rows.length
      ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
      : '<tr><td colspan="6">Sem dados disponíveis.</td></tr>';
  }

  function renderSummary(id, items) {
    const element = document.getElementById(id);
    if (!element) return;
    element.innerHTML = items.map((item) => `
      <div class="legend-box">
        <span class="k">${escapeHtml(item.label)}</span>
        <span class="v ${escapeHtml(item.className || '')}">${escapeHtml(item.value)}</span>
      </div>
    `).join('');
  }

  function togglePanelSections(mode) {
    const hidePrimary = mode === 'faturamento';
    const hideSecondary = mode === 'quantidade';

    toggleDisplay('boxChartPrimary', !hidePrimary);
    toggleDisplay('boxChartSecondary', !hideSecondary);
    toggleDisplay('tableCardPrimary', !hidePrimary);
    toggleDisplay('tableCardSecondary', !hideSecondary);
  }

  function aggregateFaturamento(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = row.unidade || 'Sem unidade';
      const current = map.get(key) || {
        unidade: key,
        volumeRealizado: 0,
        volumeMedio: 0,
        volumeProjetado: 0,
        faturamentoRealizado: 0,
        faturamentoMedio: 0,
        faturamentoProjetado: 0,
        volumePercentual: 0,
        faturamentoPercentual: 0
      };

      current.volumeRealizado += Number(row.volume_realizado || 0);
      current.volumeMedio += Number(row.volume_medio || 0);
      current.volumeProjetado += Number(row.volume_projetado || 0);
      current.faturamentoRealizado += Number(row.faturamento_realizado || 0);
      current.faturamentoMedio += Number(row.faturamento_medio || 0);
      current.faturamentoProjetado += Number(row.faturamento_projetado || 0);
      current.volumePercentual = current.volumeProjetado ? (current.volumeRealizado / current.volumeProjetado) * 100 : 0;
      current.faturamentoPercentual = current.faturamentoProjetado ? (current.faturamentoRealizado / current.faturamentoProjetado) * 100 : 0;
      map.set(key, current);
    });

    return [...map.values()].sort((left, right) => right.faturamentoProjetado - left.faturamentoProjetado);
  }

  function aggregateByKey(rows, key, valueKey) {
    const grouped = new Map();
    rows.forEach((row) => {
      const label = row[key] || 'Sem grupo';
      grouped.set(label, (grouped.get(label) || 0) + Number(row[valueKey] || 0));
    });
    return [...grouped.entries()].map(([label, value]) => ({ label, value })).sort((left, right) => right.value - left.value);
  }

  function groupRows(rows, key) {
    const grouped = new Map();
    rows.forEach((row) => {
      const label = row[key] || 'Sem grupo';
      const current = grouped.get(label) || { label, total: 0, count: 0 };
      current.total += Number(row.saldo || 0);
      current.count += 1;
      grouped.set(label, current);
    });
    return [...grouped.values()].sort((left, right) => right.total - left.total);
  }

  function numericCell(value, className) {
    const classes = ['num'];
    if (className) classes.push(className);
    return `<span class="${classes.join(' ')}">${escapeHtml(value)}</span>`;
  }

  function makeBarDataset(label, data, color, mode) {
    return {
      label,
      data,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 1,
      borderRadius: 8,
      customMode: mode
    };
  }

  function makeLineDataset(label, data, color) {
    return {
      type: 'line',
      label,
      data,
      yAxisID: 'y1',
      borderColor: color,
      backgroundColor: color,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.35
    };
  }

  function fillSelect(selectId, labelId, label, options, selectedValue, allLabel) {
    setText(labelId, label);
    const select = document.getElementById(selectId);
    if (!select) return;

    const uniqueOptions = unique(options.filter(Boolean));
    const optionMarkup = [`<option value="todos">${escapeHtml(allLabel)}</option>`]
      .concat(uniqueOptions.map((option) => `<option value="${escapeHtml(option)}"${option === selectedValue ? ' selected' : ''}>${escapeHtml(option)}</option>`))
      .join('');
    select.innerHTML = optionMarkup;
    if (!selectedValue) select.value = 'todos';
  }

  function setSelectValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
  }

  function setupLogout() {
    document.querySelectorAll('#logoutButton').forEach((button) => {
      button.addEventListener('click', () => {
        clearSession();
        window.location.href = 'index.html';
      });
    });
  }

  function ensureAuthorized(requiredRole) {
    const session = getSession();
    if (!session) {
      window.location.replace('index.html');
      return null;
    }
    if (requiredRole === 'admin' && session.role !== 'admin') {
      window.location.replace('portal.html');
      return null;
    }
    return session;
  }

  function highlightPanelLinks(panel) {
    document.querySelectorAll('[data-panel-link]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.panelLink === panel);
    });
  }

  function getRequestedPanel() {
    const panel = new URLSearchParams(window.location.search).get('panel');
    return panel && PANEL_META[panel] ? panel : 'faturamento';
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value || '';
  }

  function setHtml(id, value) {
    const element = document.getElementById(id);
    if (element) element.innerHTML = value || '';
  }

  function toggleDisplay(id, visible) {
    const element = document.getElementById(id);
    if (element) element.style.display = visible ? '' : 'none';
  }

  function unique(items) {
    return [...new Set(items)];
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  }

  function localeSort(left, right) {
    return left.localeCompare(right, 'pt-BR', { sensitivity: 'base' });
  }

  function compactNumber(value) {
    return new Intl.NumberFormat('pt-BR', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(Number(value || 0));
  }

  function compactCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(Number(value || 0));
  }

  function formatCompactNumber(value) {
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function formatPercent(value) {
    return `${Number(value || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}%`;
  }
})();
