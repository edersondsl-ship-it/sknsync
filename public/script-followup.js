let dados = [];

async function carregar() {
  try {
    const res = await fetch('/api/followups');
    dados = await res.json();
    renderLista();
    document.getElementById('statusTxt').textContent =
      `${dados.length} follow-up(s) recebido(s)`;
  } catch(e) {
    document.getElementById('statusTxt').textContent = 'Erro ao carregar';
  }
}

function cls(perc) {
  if (perc > 90) return 'danger';
  if (perc > 70) return 'warning';
  return 'ok';
}

function renderLista() {
  const el  = document.getElementById('lista');
  const q   = document.getElementById('busca').value.toLowerCase();

  let lista = dados.map((r, i) => ({...r, _idx: i}));

  if (q) {
    lista = lista.filter(r => {
      const itens = r.itens || [];
      const textoItens = itens.map(it => (it.os || '') + ' ' + (it.observacoes || '')).join(' ');
      return textoItens.toLowerCase().includes(q);
    });
  }

  if (!lista.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="icon">\uD83D\uDCED</span>
        <p>Nenhum follow-up encontrado.</p>
      </div>`;
    return;
  }

  el.innerHTML = lista.map(r => {
    const recebido = new Date(r.recebidoEm).toLocaleString('pt-BR');
    const itens    = r.itens || [];
    const baixado  = r.downloads > 0
      ? `<span class="badge badge-success">\u2713 Baixado ${new Date(r.baixadoEm).toLocaleDateString('pt-BR')}</span>`
      : `<span class="badge badge-warning">\u23F3 N\u00e3o baixado</span>`;

    const itensHtml = itens.map(it => {
      const perc  = parseFloat(it.perc) || 0;
      const c     = cls(perc);
      const larg  = Math.min(perc, 100).toFixed(1);

      const idsHtml = (it.ids || []).map(id => {
        const ip  = parseFloat(id.perc) || 0;
        const ic  = cls(ip);
        const il  = Math.min(ip, 100).toFixed(1);
        return `
          <div class="id-row">
            <div class="id-dot id-dot-${ic}"></div>
            <div class="id-name" title="${id.nome}">${id.nome}</div>
            <div class="id-hours">${Number(id.usado).toFixed(1)}h / ${Number(id.previsto).toFixed(1)}h</div>
            <div class="id-bar-track"><div class="id-bar-fill id-bar-${ic}" style="width:${il}%"></div></div>
            <div class="id-perc id-perc-${ic}">${ip.toFixed(0)}%</div>
          </div>`;
      }).join('');

      const obsHtml = it.observacoes
        ? `<div class="os-item-obs">${it.observacoes}</div>`
        : '';

      return `
        <div class="os-item">
          <div class="os-dot os-dot-${c}"></div>
          <div class="os-item-body">
            <div class="os-item-name">${it.os || '\u2014'}</div>
            <div class="os-item-hours">Usado: ${Number(it.usado).toFixed(1)}h / Previsto: ${Number(it.previsto).toFixed(1)}h</div>
            <div class="os-bar-track">
              <div class="os-bar-fill ${c}" style="width:${larg}%"></div>
            </div>
            ${idsHtml ? `<div class="ids-wrap">${idsHtml}</div>` : ''}
            ${obsHtml}
          </div>
          <div class="os-perc-badge ${c}">${perc.toFixed(0)}%</div>
        </div>
      `;
    }).join('');

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-date">\uD83D\uDCC5 ${r.data || '\u2014'}</div>
            <div class="card-recv">Recebido em ${recebido}</div>
          </div>
          ${baixado}
        </div>

        <div>${itensHtml}</div>

        <div class="card-actions">
          <button onclick="excluir(${r._idx})" class="btn-danger">\uD83D\uDDD1\uFE0F Excluir</button>
        </div>
      </div>
    `;
  }).join('');
}

async function excluir(idx) {
  if (!confirm('Excluir este follow-up?')) return;
  await fetch(`/api/followups/${idx}`, { method: 'DELETE' });
  carregar();
}

async function exportarTodos() {
  if (!dados.length) return alert('Nenhum follow-up para exportar.');
  const res = await fetch('/api/followups/export/all');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `followups_${new Date().toISOString().slice(0,10)}.txt`;
  a.click(); URL.revokeObjectURL(url);
}

document.getElementById('btnExportar').addEventListener('click', exportarTodos);
document.getElementById('busca').addEventListener('input', renderLista);

carregar();
setInterval(carregar, 30000);
