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

  const TAB_CONFIG = {
    faturamento: {
      title: 'Faturamento',
      eyebrow: 'tb_projecoes',
      subtitle: 'Painel executivo de faturamento',
      description: 'Visão profissional de volumes, faturamento realizado e projetado com filtros dinâmicos por período.',
      chartTitle: 'Evolução de faturamento',
      tableTitle: 'Detalhamento de faturamento'
    },
    receber: {
      title: 'A Receber',
      eyebrow: 'tb_a_receber',
      subtitle: 'Painel executivo de contas a receber',
      description: 'Carteira a receber com foco em clientes, portadores, vencimentos e títulos em aberto.',
      chartTitle: 'Carteira a receber',
      tableTitle: 'Detalhamento de contas a receber'
    },
    inadimplentes: {
      title: 'Inadimplentes',
      eyebrow: 'tb_inadimplentes',
      subtitle: 'Painel executivo de inadimplentes',
      description: 'Acompanhamento de valores vencidos, clientes inadimplentes e criticidade por atraso.',
      chartTitle: 'Carteira inadimplente',
      tableTitle: 'Detalhamento de inadimplência'
    }
  };

  const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const state = {
    abaAtual: 'faturamento',
    payload: null,
    charts: new Map(),
    tabela: {
      sortKey: '',
      sortDirection: 'desc',
      page: 1,
      rows: [],
      columns: [],
      renderRow: null
    },
    filtros: {
      faturamento: { mes: '', ano: '', unidade: '', chartSelection: '' },
      receber: { cliente: '', portador: '', chartSelection: '' },
      inadimplentes: { cliente: '', faixa: '', chartSelection: '' }
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;

    if (page === 'login') initLogin();
    if (page === 'admin') initProtectedPage('admin');
    if (page === 'dashboard') initDashboard();

    setupLogout();
  });

  function initLogin() {
    const session = getSession();
    if (session?.role === 'admin') window.location.replace('admin.html');
    if (session?.role === 'usuario') window.location.replace('dashboard.html');

    const form = document.getElementById('loginForm');
    const message = document.getElementById('loginMessage');

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const username = String(document.getElementById('username')?.value || '').trim().toLowerCase();
      const password = String(document.getElementById('password')?.value || '');
      const credential = CREDENTIALS[username];

      if (!credential || credential.password !== password) {
        message.textContent = 'Usuário ou senha inválidos.';
        return;
      }

      saveSession({ username, role: credential.role, loginAt: new Date().toISOString() });
      message.textContent = '';
      window.location.href = credential.redirect;
    });
  }

  function initProtectedPage(requiredRole) {
    ensureAuthorized(requiredRole);
  }

  function initDashboard() {
    const session = ensureAuthorized();
    state.payload = getFinanceData();

    setText('sessionRoleLabel', session?.role === 'admin' ? 'Administrador' : 'Usuário');
    setText('dashboardUpdatedAt', `Atualizado em ${formatDateTimeBR(state.payload?.updatedAt)}`);

    const emptyState = document.getElementById('dashboardEmptyState');
    if (!state.payload?.tables) {
      emptyState?.classList.add('is-visible');
      return;
    }

    emptyState?.classList.remove('is-visible');
    bindTabs();
    document.getElementById('clearFiltersButton')?.addEventListener('click', limparFiltros);
    trocarAba(state.abaAtual);
  }

  function bindTabs() {
    document.querySelectorAll('[data-aba]').forEach((button) => {
      button.addEventListener('click', () => trocarAba(button.dataset.aba));
    });
  }

  function trocarAba(aba) {
    state.abaAtual = aba;
    state.tabela.page = 1;
    state.tabela.sortKey = '';
    state.tabela.sortDirection = 'desc';

    document.querySelectorAll('[data-aba]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.aba === aba);
    });

    const config = TAB_CONFIG[aba];
    setText('dashboardSectionTitle', config.title);
    setText('dashboardSectionEyebrow', config.eyebrow);
    setText('dashboardSectionSubtitle', config.subtitle);
    setText('dashboardSectionDescription', config.description);
    setText('dashboardChartTitle', config.chartTitle);
    setText('dashboardTableTitle', config.tableTitle);

    updateDashboard();
  }

  function updateDashboard() {
    if (state.abaAtual === 'faturamento') {
      updateFaturamento();
      return;
    }
    if (state.abaAtual === 'receber') {
      updateReceber();
      return;
    }
    updateInadimplentes();
  }

  function updateFaturamento() {
    const rows = state.payload?.tables?.tb_projecoes || [];
    const filtros = state.filtros.faturamento;
    const periods = rows.map((row) => parsePeriodo(row.periodo)).filter(Boolean);
    const unidades = uniqueValues(rows, 'unidade');

    renderFilters([
      { id: 'mes', label: 'Mês', type: 'select', value: filtros.mes, options: uniqueOptions(periods.map((item) => ({ value: String(item.month).padStart(2, '0'), label: MONTH_LABELS[item.month - 1] }))) },
      { id: 'ano', label: 'Ano', type: 'select', value: filtros.ano, options: uniqueOptions(periods.map((item) => ({ value: String(item.year), label: String(item.year) }))) },
      { id: 'unidade', label: 'Unidade', type: 'select', value: filtros.unidade, options: unidades.map((value) => ({ value, label: value })) }
    ], 'faturamento');

    const filteredRows = rows.filter((row) => {
      const periodo = parsePeriodo(row.periodo);
      const mesOk = !filtros.mes || String(periodo?.month).padStart(2, '0') === filtros.mes;
      const anoOk = !filtros.ano || String(periodo?.year) === filtros.ano;
      const unidadeOk = !filtros.unidade || row.unidade === filtros.unidade;
      const chartOk = !filtros.chartSelection || row.unidade === filtros.chartSelection || row.periodo === filtros.chartSelection;
      return mesOk && anoOk && unidadeOk && chartOk;
    });

    const summary = summarizeFaturamento(filteredRows);
    renderCards([
      { label: 'Total faturado', value: formatCurrency(summary.totalFaturado), accent: true },
      { label: 'Projetado', value: formatCurrency(summary.totalProjetado) },
      { label: 'Realizado', value: formatCurrency(summary.totalRealizado) },
      { label: 'Registros', value: String(filteredRows.length) }
    ]);

    setText('chart1Title', 'Faturamento realizado x projetado');
    setText('chart2Title', 'Volume projetado por unidade');

    criarGrafico('chartPrimary', {
      type: 'bar',
      data: {
        labels: summary.byUnidade.map((item) => item.label),
        datasets: [
          {
            type: 'bar',
            label: 'Realizado',
            data: summary.byUnidade.map((item) => item.realizado),
            backgroundColor: 'rgba(255, 122, 26, 0.82)',
            borderRadius: 10
          },
          {
            type: 'bar',
            label: 'Projetado',
            data: summary.byUnidade.map((item) => item.projetado),
            backgroundColor: 'rgba(99, 132, 255, 0.72)',
            borderRadius: 10
          },
          {
            type: 'line',
            label: '% atingido',
            data: summary.byUnidade.map((item) => item.percentual),
            borderColor: 'rgba(255, 208, 123, 1)',
            backgroundColor: 'rgba(255, 208, 123, 0.15)',
            yAxisID: 'y1',
            tension: 0.35
          }
        ]
      },
      options: {
        scales: {
          x: buildAxisOptions('Unidade'),
          y: buildValueAxis('Valores financeiros'),
          y1: {
            position: 'right',
            beginAtZero: true,
            grid: { display: false },
            ticks: {
              color: '#ffcf9a',
              callback: (value) => `${Number(value || 0).toFixed(0)}%`
            }
          }
        }
      },
      onClick: (label) => {
        state.filtros.faturamento.chartSelection = state.filtros.faturamento.chartSelection === label ? '' : label;
        updateDashboard();
      }
    });

    criarGrafico('chartSecondary', {
      type: 'bar',
      data: {
        labels: summary.byUnidade.map((item) => item.label),
        datasets: [{
          label: 'Volume projetado',
          data: summary.byUnidade.map((item) => item.volumeProjetado),
          backgroundColor: 'rgba(255, 208, 123, 0.78)',
          borderRadius: 10
        }]
      },
      options: {
        scales: {
          x: buildAxisOptions('Unidade'),
          y: buildNumberAxis('Volume')
        }
      },
      onClick: (label) => {
        state.filtros.faturamento.chartSelection = state.filtros.faturamento.chartSelection === label ? '' : label;
        updateDashboard();
      }
    });

    renderManagedTable({
      columns: [
        { key: 'unidade', label: 'Unidade de negócio' },
        { key: 'unidade_medida', label: 'Unidade de medida' },
        { key: 'volume_realizado', label: 'Volume realizado', numeric: true },
        { key: 'volume_projetado', label: 'Volume projetado', numeric: true },
        { key: 'faturamento_realizado', label: 'Faturamento realizado', numeric: true },
        { key: 'faturamento_projetado', label: 'Faturamento projetado', numeric: true }
      ],
      rows: summary.byUnidade.map((item) => ({
        unidade: item.label,
        unidade_medida: item.unidadeMedida,
        volume_realizado: item.volumeRealizado,
        volume_projetado: item.volumeProjetado,
        faturamento_realizado: item.realizado,
        faturamento_projetado: item.projetado
      })),
      renderRow: (row) => `
        <tr>
          <td>${escapeHtml(row.unidade)}</td>
          <td>${escapeHtml(row.unidade_medida || '-')}</td>
          <td class="numeric-cell">${escapeHtml(formatNumber(row.volume_realizado))}</td>
          <td class="numeric-cell">${escapeHtml(formatNumber(row.volume_projetado))}</td>
          <td class="numeric-cell">${escapeHtml(formatCurrency(row.faturamento_realizado))}</td>
          <td class="numeric-cell">${escapeHtml(formatCurrency(row.faturamento_projetado))}</td>
        </tr>
      `,
      defaultSortKey: 'faturamento_projetado'
    });
  }

  function updateReceber() {
    const rows = state.payload?.tables?.tb_a_receber || [];
    const filtros = state.filtros.receber;

    renderFilters([
      { id: 'cliente', label: 'Cliente', type: 'select', value: filtros.cliente, options: uniqueValues(rows, 'cliente').map(optionObject) },
      { id: 'portador', label: 'Portador', type: 'select', value: filtros.portador, options: uniqueValues(rows, 'portador').map(optionObject) }
    ], 'receber');

    const filteredRows = rows.filter((row) => {
      const clienteOk = !filtros.cliente || row.cliente === filtros.cliente;
      const portadorOk = !filtros.portador || row.portador === filtros.portador;
      const chartOk = !filtros.chartSelection || row.cliente === filtros.chartSelection;
      return clienteOk && portadorOk && chartOk;
    });

    const byCliente = aggregateMetric(filteredRows, 'cliente', 'saldo').slice(0, 10);
    const byPortador = aggregateMetric(filteredRows, 'portador', 'saldo').slice(0, 10);
    const total = sum(filteredRows, 'saldo');

    renderCards([
      { label: 'Total a receber', value: formatCurrency(total), accent: true },
      { label: 'Total clientes', value: String(uniqueValues(filteredRows, 'cliente').length) },
      { label: 'Total portador', value: String(uniqueValues(filteredRows, 'portador').length) },
      { label: 'Quantidade títulos', value: String(filteredRows.length) }
    ]);

    setText('chart1Title', 'A receber por cliente');
    setText('chart2Title', 'A receber por portador');

    criarGrafico('chartPrimary', {
      type: 'bar',
      data: {
        labels: byCliente.map((item) => item.label),
        datasets: [{
          label: 'Valor a receber',
          data: byCliente.map((item) => item.value),
          backgroundColor: 'rgba(255, 122, 26, 0.82)',
          borderRadius: 10
        }]
      },
      options: {
        scales: {
          x: buildAxisOptions('Cliente'),
          y: buildValueAxis('Valor')
        }
      },
      onClick: (label) => {
        state.filtros.receber.chartSelection = state.filtros.receber.chartSelection === label ? '' : label;
        updateDashboard();
      }
    });

    criarGrafico('chartSecondary', {
      type: 'bar',
      data: {
        labels: byPortador.map((item) => item.label),
        datasets: [{
          label: 'Valor a receber',
          data: byPortador.map((item) => item.value),
          backgroundColor: 'rgba(99, 132, 255, 0.72)',
          borderRadius: 10
        }]
      },
      options: {
        scales: {
          x: buildAxisOptions('Portador'),
          y: buildValueAxis('Valor')
        }
      }
    });

    renderManagedTable({
      columns: [
        { key: 'cliente', label: 'Cliente' },
        { key: 'saldo', label: 'Valor', numeric: true },
        { key: 'vencimento', label: 'Vencimento' },
        { key: 'portador', label: 'Portador' },
        { key: 'classificacao_vencimento', label: 'Status' }
      ],
      rows: filteredRows.map((row) => ({
        cliente: row.cliente,
        saldo: row.saldo,
        vencimento: row.vencimento,
        portador: row.portador,
        classificacao_vencimento: row.classificacao_vencimento || 'A vencer'
      })),
      renderRow: (row) => `
        <tr>
          <td>${escapeHtml(row.cliente)}</td>
          <td class="numeric-cell">${escapeHtml(formatCurrency(row.saldo))}</td>
          <td>${escapeHtml(formatDateBR(row.vencimento))}</td>
          <td>${escapeHtml(row.portador || '-')}</td>
          <td>${escapeHtml(row.classificacao_vencimento || 'A vencer')}</td>
        </tr>
      `,
      defaultSortKey: 'saldo'
    });
  }

  function updateInadimplentes() {
    const rows = state.payload?.tables?.tb_inadimplentes || [];
    const filtros = state.filtros.inadimplentes;

    renderFilters([
      { id: 'cliente', label: 'Cliente', type: 'select', value: filtros.cliente, options: uniqueValues(rows, 'cliente').map(optionObject) },
      { id: 'faixa', label: 'Faixa atraso', type: 'select', value: filtros.faixa, options: uniqueValues(rows, 'faixa_atraso').map(optionObject) }
    ], 'inadimplentes');

    const filteredRows = rows.filter((row) => {
      const clienteOk = !filtros.cliente || row.cliente === filtros.cliente;
      const faixaOk = !filtros.faixa || row.faixa_atraso === filtros.faixa;
      const chartOk = !filtros.chartSelection || row.cliente === filtros.chartSelection;
      return clienteOk && faixaOk && chartOk;
    });

    const byCliente = aggregateMetric(filteredRows, 'cliente', 'saldo').slice(0, 10);
    const byFaixa = aggregateMetric(filteredRows, 'faixa_atraso', 'saldo');
    const total = sum(filteredRows, 'saldo');

    renderCards([
      { label: 'Total inadimplente', value: formatCurrency(total), accent: true },
      { label: 'Total clientes', value: String(uniqueValues(filteredRows, 'cliente').length) },
      { label: 'Ticket médio', value: formatCurrency(filteredRows.length ? total / filteredRows.length : 0) },
      { label: 'Quantidade títulos', value: String(filteredRows.length) }
    ]);

    setText('chart1Title', 'Inadimplentes por cliente');
    setText('chart2Title', 'Inadimplência por faixa');

    criarGrafico('chartPrimary', {
      type: 'bar',
      data: {
        labels: byCliente.map((item) => item.label),
        datasets: [{
          label: 'Valor vencido',
          data: byCliente.map((item) => item.value),
          backgroundColor: 'rgba(255, 122, 26, 0.82)',
          borderRadius: 10
        }]
      },
      options: {
        scales: {
          x: buildAxisOptions('Cliente'),
          y: buildValueAxis('Valor')
        }
      },
      onClick: (label) => {
        state.filtros.inadimplentes.chartSelection = state.filtros.inadimplentes.chartSelection === label ? '' : label;
        updateDashboard();
      }
    });

    criarGrafico('chartSecondary', {
      type: 'bar',
      data: {
        labels: byFaixa.map((item) => item.label),
        datasets: [{
          label: 'Valor vencido',
          data: byFaixa.map((item) => item.value),
          backgroundColor: 'rgba(99, 132, 255, 0.72)',
          borderRadius: 10
        }]
      },
      options: {
        scales: {
          x: buildAxisOptions('Faixa'),
          y: buildValueAxis('Valor')
        }
      }
    });

    renderManagedTable({
      columns: [
        { key: 'cliente', label: 'Cliente' },
        { key: 'saldo', label: 'Valor', numeric: true },
        { key: 'dias_em_atraso', label: 'Dias atraso', numeric: true },
        { key: 'faixa_atraso', label: 'Status' }
      ],
      rows: filteredRows.map((row) => ({
        cliente: row.cliente,
        saldo: row.saldo,
        dias_em_atraso: row.dias_em_atraso,
        faixa_atraso: row.faixa_atraso || 'Vencido'
      })),
      renderRow: (row) => `
        <tr>
          <td>${escapeHtml(row.cliente)}</td>
          <td class="numeric-cell">${escapeHtml(formatCurrency(row.saldo))}</td>
          <td class="numeric-cell">${escapeHtml(formatNumber(row.dias_em_atraso))}</td>
          <td>${escapeHtml(row.faixa_atraso || 'Vencido')}</td>
        </tr>
      `,
      defaultSortKey: 'saldo'
    });
  }

  function renderFilters(filters, aba) {
    const container = document.getElementById('dashboardFilters');
    if (!container) return;

    container.className = `filters-row tab-filters-grid ${filters.length >= 4 ? 'filters-grid-four' : ''}`.trim();
    container.innerHTML = filters.map((filter) => {
      if (filter.type === 'select') {
        return `
          <label class="filter-field">
            <span>${escapeHtml(filter.label)}</span>
            <select data-filter-id="${escapeHtml(filter.id)}">
              <option value="">Todos</option>
              ${filter.options.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === filter.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </label>
        `;
      }

      return `
        <label class="filter-field">
          <span>${escapeHtml(filter.label)}</span>
          <input data-filter-id="${escapeHtml(filter.id)}" type="${escapeHtml(filter.type)}" value="${escapeHtml(filter.value || '')}" />
        </label>
      `;
    }).join('');

    container.querySelectorAll('[data-filter-id]').forEach((input) => {
      input.addEventListener('input', () => {
        state.filtros[aba][input.dataset.filterId] = input.value;
        state.tabela.page = 1;
        updateDashboard();
      });
      input.addEventListener('change', () => {
        state.filtros[aba][input.dataset.filterId] = input.value;
        state.tabela.page = 1;
        updateDashboard();
      });
    });
  }

  function renderCards(cards) {
    const container = document.getElementById('dashboardCards');
    if (!container) return;
    container.innerHTML = cards.map((card) => `
      <article class="stat-card premium-kpi${card.accent ? ' accent' : ''}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
      </article>
    `).join('');
  }

  function criarGrafico(canvasId, { type, data, options, onClick }) {
    if (!window.Chart) return;

    const previous = state.charts.get(canvasId);
    if (previous) previous.destroy();

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const chart = new window.Chart(canvas, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#f5f7fb' }
          },
          tooltip: {
            callbacks: {
              label(context) {
                if (context.dataset?.label?.includes('%')) return `${context.dataset.label}: ${Number(context.raw || 0).toFixed(1)}%`;
                if (canvasId === 'chartSecondary' && state.abaAtual === 'faturamento') return `${context.dataset.label}: ${formatNumber(context.raw)}`;
                return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
              }
            }
          }
        },
        onClick: (_, elements) => {
          if (!elements?.length || !onClick) return;
          const index = elements[0].index;
          const label = data.labels[index];
          onClick(label);
        },
        ...options
      }
    });

    state.charts.set(canvasId, chart);
  }

  function renderManagedTable({ columns, rows, renderRow, defaultSortKey }) {
    const head = document.getElementById('dashboardTableHead');
    const body = document.getElementById('dashboardTableBody');
    const footer = document.getElementById('dashboardTablePagination');
    if (!head || !body || !footer) return;

    if (state.tabela.sortKey !== defaultSortKey && !state.tabela.sortKey) {
      state.tabela.sortKey = defaultSortKey;
      state.tabela.sortDirection = 'desc';
    }

    state.tabela.rows = rows;
    state.tabela.columns = columns;
    state.tabela.renderRow = renderRow;

    head.innerHTML = columns.map((column) => `
      <th data-sort-key="${escapeHtml(column.key)}"${column.numeric ? ' class="numeric-column"' : ''}>${escapeHtml(column.label)}</th>
    `).join('');

    head.querySelectorAll('th[data-sort-key]').forEach((header) => {
      header.addEventListener('click', () => {
        const key = header.dataset.sortKey;
        if (state.tabela.sortKey === key) {
          state.tabela.sortDirection = state.tabela.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          state.tabela.sortKey = key;
          state.tabela.sortDirection = 'asc';
        }
        state.tabela.page = 1;
        renderManagedTable({ columns, rows, renderRow, defaultSortKey });
      });
    });

    const sortedRows = sortRows(rows, state.tabela.sortKey, state.tabela.sortDirection);
    const pageSize = 8;
    const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    state.tabela.page = Math.min(state.tabela.page, totalPages);
    const start = (state.tabela.page - 1) * pageSize;
    const pageRows = sortedRows.slice(start, start + pageSize);

    body.innerHTML = pageRows.length
      ? pageRows.map((row) => renderRow(row)).join('')
      : `<tr><td colspan="${columns.length}" class="empty-state-cell">Sem dados disponíveis.</td></tr>`;

    footer.innerHTML = `
      <div class="meta-pill">Página ${state.tabela.page} de ${totalPages} • ${sortedRows.length} registros</div>
      <div class="pager-actions">
        <button class="btn btn-secondary" type="button" data-page="prev"${state.tabela.page === 1 ? ' disabled' : ''}>Anterior</button>
        <button class="btn btn-secondary" type="button" data-page="next"${state.tabela.page === totalPages ? ' disabled' : ''}>Próxima</button>
      </div>
    `;

    footer.querySelector('[data-page="prev"]')?.addEventListener('click', () => {
      state.tabela.page = Math.max(1, state.tabela.page - 1);
      renderManagedTable({ columns, rows, renderRow, defaultSortKey });
    });
    footer.querySelector('[data-page="next"]')?.addEventListener('click', () => {
      state.tabela.page = Math.min(totalPages, state.tabela.page + 1);
      renderManagedTable({ columns, rows, renderRow, defaultSortKey });
    });
  }

  function limparFiltros() {
    const base = state.abaAtual === 'faturamento'
      ? { mes: '', ano: '', unidade: '', chartSelection: '' }
      : state.abaAtual === 'receber'
        ? { cliente: '', portador: '', chartSelection: '' }
        : { cliente: '', faixa: '', chartSelection: '' };

    state.filtros[state.abaAtual] = base;
    state.tabela.page = 1;
    updateDashboard();
  }

  function summarizeFaturamento(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = row.unidade || 'Sem unidade';
      const current = map.get(key) || {
        label: key,
        unidadeMedida: row.unidade_medida || '-',
        volumeRealizado: 0,
        volumeProjetado: 0,
        realizado: 0,
        projetado: 0,
        percentual: 0
      };
      current.volumeRealizado += Number(row.volume_realizado || 0);
      current.volumeProjetado += Number(row.volume_projetado || 0);
      current.realizado += Number(row.faturamento_realizado || 0);
      current.projetado += Number(row.faturamento_projetado || 0);
      current.percentual = current.projetado ? (current.realizado / current.projetado) * 100 : 0;
      map.set(key, current);
    });

    const byUnidade = [...map.values()].sort((a, b) => b.projetado - a.projetado);
    return {
      byUnidade,
      totalRealizado: sum(rows, 'faturamento_realizado'),
      totalProjetado: sum(rows, 'faturamento_projetado'),
      totalFaturado: sum(rows, 'faturamento_realizado') + sum(rows, 'faturamento_medio')
    };
  }

  function aggregateMetric(rows, field, valueField) {
    const bucket = new Map();
    rows.forEach((row) => {
      const label = row[field] || 'Sem grupo';
      bucket.set(label, (bucket.get(label) || 0) + Number(row[valueField] || 0));
    });
    return [...bucket.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }

  function ensureAuthorized(requiredRole) {
    const session = getSession();
    if (!session) {
      window.location.replace('index.html');
      return null;
    }
    if (requiredRole === 'admin' && session.role !== 'admin') {
      window.location.replace('dashboard.html');
      return null;
    }
    return session;
  }

  function setupLogout() {
    const logoutButton = document.getElementById('logoutButton');
    logoutButton?.addEventListener('click', () => {
      clearSession();
      window.location.href = 'index.html';
    });
  }

  function buildAxisOptions(title) {
    return {
      title: buildAxisTitle(title),
      ticks: {
        color: '#d4def8',
        maxRotation: 0,
        autoSkip: false
      },
      grid: {
        display: false
      }
    };
  }

  function buildValueAxis(title) {
    return {
      beginAtZero: true,
      title: buildAxisTitle(title),
      ticks: {
        color: '#99a5c3',
        callback: (value) => compactCurrency(value)
      },
      grid: { color: 'rgba(255,255,255,0.07)' }
    };
  }

  function buildNumberAxis(title) {
    return {
      beginAtZero: true,
      title: buildAxisTitle(title),
      ticks: {
        color: '#99a5c3',
        callback: (value) => compactNumber(value)
      },
      grid: { color: 'rgba(255,255,255,0.07)' }
    };
  }

  function buildAxisTitle(text) {
    return {
      display: true,
      text,
      color: '#99a5c3',
      font: { size: 12, weight: '600' }
    };
  }

  function parsePeriodo(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})[-/](\d{1,2})$/) || raw.match(/^(\d{1,2})[-/](\d{4})$/);
    if (!match) return null;
    if (raw.match(/^(\d{4})[-/](\d{1,2})$/)) return { year: Number(match[1]), month: Number(match[2]) };
    return { year: Number(match[2]), month: Number(match[1]) };
  }

  function optionObject(value) {
    return { value, label: value };
  }

  function uniqueOptions(options) {
    const seen = new Map();
    options.forEach((option) => {
      if (!option?.value || seen.has(option.value)) return;
      seen.set(option.value, option);
    });
    return [...seen.values()];
  }

  function uniqueValues(rows, field) {
    return [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort();
  }

  function sortRows(rows, sortKey, direction) {
    const factor = direction === 'asc' ? 1 : -1;
    return [...rows].sort((left, right) => compareValues(left?.[sortKey], right?.[sortKey]) * factor);
  }

  function compareValues(left, right) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber) && String(left).trim() !== '' && String(right).trim() !== '') {
      return leftNumber - rightNumber;
    }
    const leftDate = Date.parse(left);
    const rightDate = Date.parse(right);
    if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
      return leftDate - rightDate;
    }
    return String(left || '').localeCompare(String(right || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  function compactCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(Number(value || 0));
  }

  function compactNumber(value) {
    return new Intl.NumberFormat('pt-BR', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(Number(value || 0));
  }

  function sum(rows, field) {
    return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value || '';
  }
})();
