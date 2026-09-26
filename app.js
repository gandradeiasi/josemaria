/* Aplicação offline. Recebe os dados em window.__DATA__ (injetado no build). */
'use strict';

const DATA = window.__DATA__ || { books: [] };
const CHAVE = 'pontos.salvos.v1';

const $ = (s) => document.querySelector(s);
const el = {
  q: $('#q'), abas: $('#abas'), filtros: $('#filtros'), btnFiltros: $('#btnFiltros'),
  fObra: $('#fObra'), fCap: $('#fCap'),
  resumo: $('#resumo'), lista: $('#lista'), vazio: $('#vazio'), contSalvos: $('#contSalvos'),
  contAleatorio: $('#contAleatorio'), btnAleatorio: $('#btnAleatorio'),
  dlg: $('#dlg'), dlgTitulo: $('#dlgTitulo'), dlgCorpo: $('#dlgCorpo'),
  dlgFechar: $('#dlgFechar'), dlgSalvar: $('#dlgSalvar'), dlgOutro: $('#dlgOutro'),
  dlgAnterior: $('#dlgAnterior'), dlgProx: $('#dlgProx'),
};

// os botões têm ícone + rótulo; mudamos só o texto, preservando o ícone
const rotulo = (botao) => botao.querySelector('span') || botao;

/* índice plano: cada ponto ganha livro, capítulo e texto normalizado */
const PONTOS = [];
const OBROS = new Map();
for (const b of DATA.books) {
  OBROS.set(b.slug, b);
  for (const p of b.points) {
    const c = b.chapters.find((c) => p.n >= c.start && p.n <= c.end);
    PONTOS.push({
      n: p.n,
      livro: b.slug,
      livroTitulo: b.title,
      capitulo: p.chapter,
      capN: c ? c.n : 0,
      texto: p.text,
      url: p.url,
      busca: normalizar(p.text),
    });
  }
}

function normalizar(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* ------------------------------ favoritos ------------------------------- */

function lerSalvos() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; }
  catch { return {}; }
}
function gravarSalvos(s) {
  try { localStorage.setItem(CHAVE, JSON.stringify(s)); }
  catch (e) { console.warn('não foi possível salvar localmente', e); }
  atualizarCont();
}
let salvos = lerSalvos();
const chaveDe = (p) => `${p.livro}:${p.n}`;
function atualizarCont() {
  el.contSalvos.textContent = Object.keys(salvos).length || '';
}

/**
 * Mostra de onde o botão Aleatório vai sortear.
 * O escopo muda conforme a página (Pontos ou Salvos), a busca e os filtros,
 * e isso não é óbvio só pelo rótulo — por isso o contador e a dica ficam
 * visíveis. O número é exatamente o tanto de pontos que o sorteio pode
 * encontrar, porque o sorteio roda sobre a mesma lista filtrada.
 */
function atualizarAleatorio(n) {
  if (!el.contAleatorio) return;
  el.contAleatorio.textContent = n || '';
  if (!el.btnAleatorio) return;
  el.btnAleatorio.title = n
    ? `Sorteia entre os ${n} pontos que você está vendo agora`
    : 'Nenhum ponto no escopo atual para sortear';
  el.btnAleatorio.classList.toggle('vazio', n === 0);
  el.btnAleatorio.setAttribute('aria-label', el.btnAleatorio.title);
}

/* -------------------------------- busca --------------------------------- */

let termos = [];

/**
 * A lista sobre a qual a busca e os filtros atuam.
 * Pesquisa vê todos os pontos; Salvos vê só os que o usuário guardou.
 */
function baseAtual() {
  return abaAtual === 'salvos' ? listaSalvos() : PONTOS;
}

/**
 * Aplica os filtros e a busca sobre a página atual.
 * Sem termo de busca ordena por número; com busca, por relevância.
 */
function filtrar() {
  let out = baseAtual();

  const obra = el.fObra.value;
  if (obra) out = out.filter((p) => p.livro === obra);

  const cap = el.fCap.value;
  if (cap) out = out.filter((p) => String(p.capN) === cap);

  if (termos.length) {
    out = out
      .map((p) => ({ p, pos: pontuar(p) }))
      .filter((r) => r.pos > 0)
      .sort((a, b) => b.pos - a.pos)
      .map((r) => r.p);
  } else {
    out = [...out].sort((a, b) => a.n - b.n);
  }
  return out;
}

function pontuar(p) {
  let pontos = 0;
  for (const t of termos) {
    // busca por número: "983" acha o ponto 983 mesmo que o número
    // não apareça no texto
    if (/^\d{1,4}$/.test(t) && p.n === Number(t)) return 1000;

    const i = p.busca.indexOf(t);
    if (i === -1) return 0;
    pontos += 100;
    if (i === 0) pontos += 30;              // começa o ponto
    if (p.busca.startsWith(t)) pontos += 20;
  }
  return pontos;
}

/* -------------------------------- render --------------------------------- */

function escapar(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/**
 * Realça as ocorrências dos termos, ignorando acentos e maiúsculas.
 * Trabalha por posição: normaliza o texto mantendo um mapa de índices,
 * busca no texto normalizado e marca no texto original — assim
 * "perseveranca" encontra "Perseverança" sem quebrar o HTML.
 */
function marcar(texto) {
  if (!termos.length) return escapar(texto);

  // normaliza mantendo o índice original de cada caractere
  let normal = '';
  const mapa = []; // mapa[i] = índice no texto original
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    const d = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (let k = 0; k < d.length; k++) {
      normal += d[k];
      mapa.push(i);
    }
  }
  mapa.push(texto.length); // sentinela

  // intervalos a marcar, já sem sobreposição
  const cortes = [];
  for (const t of termos) {
    if (!t) continue;
    let de = 0;
    for (;;) {
      const i = normal.indexOf(t, de);
      if (i === -1) break;
      cortes.push([mapa[i], mapa[i + t.length]]);
      de = i + t.length;
    }
  }
  if (!cortes.length) return escapar(texto);

  cortes.sort((a, b) => a[0] - b[0]);
  const unidas = [];
  for (const c of cortes) {
    const ult = unidas[unidas.length - 1];
    if (ult && c[0] <= ult[1]) ult[1] = Math.max(ult[1], c[1]);
    else unidas.push([c[0], c[1]]);
  }

  let out = '';
  let pos = 0;
  for (const [a, b] of unidas) {
    out += escapar(texto.slice(pos, a)) + '<mark>' + escapar(texto.slice(a, b)) + '</mark>';
    pos = b;
  }
  out += escapar(texto.slice(pos));
  return out;
}

function previa(texto, max = 220) {
  if (!termos.length) {
    return texto.length > max ? texto.slice(0, max).trim() + '…' : texto;
  }
  const b = normalizar(texto);
  let i = Math.min(...termos.map((t) => (b.indexOf(t) === -1 ? Infinity : b.indexOf(t))));
  if (i === Infinity) i = 0;
  const ini = Math.max(0, i - 60);
  return (ini > 0 ? '…' : '') + texto.slice(ini, ini + max).trim() + (ini + max < texto.length ? '…' : '');
}

function render() {
  const res = filtrar();
  el.lista.innerHTML = '';

  for (const p of res.slice(0, 400)) {
    const li = document.createElement('li');
    li.className = 'item';
    li.tabIndex = 0;

    const topo = document.createElement('div');
    topo.className = 'item-topo';
    const salvo = salvos[chaveDe(p)];
    // o selo de "salvo" fica sempre no DOM, só invisível quando não é salvo:
    // se ele aparecesse e sumisse, a linha mudaria de largura a cada clique
    topo.innerHTML =
      `<span class="item-n">${p.n}</span>` +
      `<span class="item-livro">${escapar(p.livroTitulo)} · ${escapar(p.capitulo)}</span>` +
      `<span class="item-salvo${salvo ? '' : ' invisivel'}">salvo</span>`;

    const txt = document.createElement('div');
    txt.className = 'item-texto';
    txt.innerHTML = `<p>${marcar(previa(p.texto))}</p>`;

    li.append(topo, txt);
    li.addEventListener('click', () => abrir(p));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(p); }
    });
    el.lista.append(li);
  }

  const total = PONTOS.length;
  let resumo = `${res.length} de ${total} pontos`;
  if (res.length > 400) resumo += ' (mostrando os 400 primeiros — refine a busca)';
  el.resumo.textContent = resumo;
  // a linha é de altura fixa e corta com reticências: o texto inteiro fica
  // disponível no title, para o usuário não perder a informação
  el.resumo.title = resumo;
  el.vazio.hidden = res.length > 0;
  el.vazio.textContent = termos.length
    ? 'Nenhum ponto encontrado para esta busca.'
    : 'Nenhum ponto corresponde aos filtros.';
}

/* ---------------- estado de filtros separado por aba --------------------- */

/**
 * Cada aba tem busca e filtros próprios: filtrar em Pontos não pode
 * alterar o que está selecionado em Salvos, e vice-versa.
 */
const ESTADOS = {
  busca: { termo: '', obra: '', cap: '' },
  salvos: { termo: '', obra: '', cap: '' },
};

function salvarEstado() {
  ESTADOS[abaAtual] = {
    termo: el.q.value,
    obra: el.fObra.value,
    cap: el.fCap.value,
  };
}

function aplicarEstado() {
  const e = ESTADOS[abaAtual] || { termo: '', obra: '', cap: '' };
  el.q.value = e.termo;
  el.fObra.value = e.obra;
  // a lista de capítulos depende da obra, então só depois de repopulá-la
  // é que o capítulo salvo pode ser restaurado
  popularCapitulos();
  el.fCap.value = e.cap;
  termos = normalizar(e.termo).split(/\s+/).filter(Boolean);
}

/* ------------------------------- diálogo --------------------------------- */

let atual = null;     // ponto aberto
let contexto = [];    // lista de onde navegar (resultado atual ou filtragem)
let abaAtual = 'busca';
let filtrosAbertos = false; // no celular os filtros ficam recolhidos

function abrir(p) {
  atual = p;
  el.dlgTitulo.textContent = `${p.livroTitulo} · ${p.capitulo} · ponto ${p.n}`;
  el.dlgCorpo.innerHTML =
    `<h2>${p.n}</h2>` +
    `<p>${escapar(p.texto)}</p>`;

  marcarSalvo(!!salvos[chaveDe(p)]);

  if (!el.dlg.open) el.dlg.showModal();
}

/** Atualiza o botão Salvar sem destruir o ícone. */
function marcarSalvo(ligado) {
  rotulo(el.dlgSalvar).textContent = ligado ? 'Salvo' : 'Salvar';
  el.dlgSalvar.classList.toggle('on', ligado);
  el.dlgSalvar.setAttribute('aria-pressed', ligado ? 'true' : 'false');
}

function navegar(delta) {
  if (!contexto.length) return;
  const i = contexto.findIndex((p) => chaveDe(p) === chaveDe(atual));
  if (i === -1) return;
  const j = (i + delta + contexto.length) % contexto.length;
  abrir(contexto[j]);
}

el.dlgFechar.addEventListener('click', () => el.dlg.close());
el.dlgAnterior.addEventListener('click', () => navegar(-1));
el.dlgProx.addEventListener('click', () => navegar(1));
el.dlgOutro.addEventListener('click', () => { sortear(); });
el.dlgSalvar.addEventListener('click', () => {
  if (!atual) return;
  const k = chaveDe(atual);
  if (salvos[k]) delete salvos[k];
  else salvos[k] = { n: atual.n, livro: atual.livro, titulo: atual.livroTitulo, quando: new Date().toISOString() };
  gravarSalvos(salvos);
  marcarSalvo(!!salvos[k]);
  renderAba(); // redesenha a aba atual (Salvar precisa sair da lista de salvos)
});

/**
 * Sorteia e abre um ponto. Só é chamado por ação explícita do usuário:
 * o botão "Aleatório" ou o "Outro" do diálogo.
 * Sempre sorteia dentro dos filtros da aba Pesquisa, nunca da lista de salvos,
 * e evita repetir o ponto que já está aberto.
 */
function sortear() {
  const base = filtrar();
  contexto = base;
  if (!base.length) return null;

  let alvo = base[Math.floor(Math.random() * base.length)];
  if (base.length > 1 && atual && chaveDe(alvo) === chaveDe(atual)) {
    const outros = base.filter((p) => chaveDe(p) !== chaveDe(atual));
    alvo = outros[Math.floor(Math.random() * outros.length)];
  }
  abrir(alvo);
  return alvo;
}

function listaSalvos() {
  return Object.entries(salvos)
    .map(([k, v]) => PONTOS.find((p) => chaveDe(p) === k))
    .filter(Boolean)
    .sort((a, b) => a.livro.localeCompare(b.livro) || a.n - b.n);
}

/* --------------------------------- abas ---------------------------------- */

function renderAba() {
  // busca e filtros valem nas duas páginas: cada uma filtra a sua lista
  el.filtros.hidden = !filtrosAbertos;
  el.btnFiltros.hidden = false;
  el.q.disabled = false;

  contexto = filtrar();
  atualizarAleatorio(contexto.length);

  // Atenção: aqui não se sorteia nada. Sortear só acontece por ação
  // explícita do usuário: o botão "Aleatório" ou o "Outro" do diálogo.
  if (abaAtual === 'salvos') {
    el.lista.innerHTML = '';
    for (const p of contexto) {
      const li = document.createElement('li');
      li.className = 'item';
      const data = salvos[chaveDe(p)].quando.slice(0, 10);
      li.innerHTML =
        `<div class="item-topo"><span class="item-n">${p.n}</span>` +
        `<span class="item-livro">${escapar(p.livroTitulo)} · ${escapar(p.capitulo)}</span>` +
        `<span class="item-salvo">${data}</span></div>` +
        `<div class="item-texto"><p>${marcar(previa(p.texto, 200))}</p></div>`;
      li.addEventListener('click', () => abrir(p));
      el.lista.append(li);
    }
    const totalSalvos = Object.keys(salvos).length;
    el.resumo.textContent = termos.length || el.fObra.value || el.fCap.value
      ? `${contexto.length} de ${totalSalvos} pontos salvos`
      : `${totalSalvos} pontos salvos`;
    el.vazio.hidden = contexto.length > 0;
    el.vazio.textContent = totalSalvos === 0
      ? 'Nenhum ponto salvo ainda. Na leitura de um ponto, use Salvar.'
      : 'Nenhum ponto salvo corresponde a esta busca.';
    el.resumo.title = el.resumo.textContent;
    return;
  }

  render();
}

el.abas.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;

  // "Aleatório" não é uma aba: é uma ação. Só sorteia e abre o diálogo,
  // sem trocar a visão nem a aba marcada.
  if (b.dataset.v === 'aleatorio') {
    sortear();
    return;
  }

  if (b.dataset.v === abaAtual) {
    renderAba();
    if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
    return;
  }

  salvarEstado();          // guarda o que estava na aba que estamos saindo
  abaAtual = b.dataset.v;
  aplicarEstado();         // e traz de volta o da aba que estamos entrando
  for (const btn of el.abas.children) btn.classList.toggle('ativo', btn === b);
  renderAba();
  // volta ao topo: clicar em Pontos deve mostrar a lista, não o meio dela
  if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
});

el.btnFiltros.addEventListener('click', () => {
  filtrosAbertos = !filtrosAbertos;
  el.btnFiltros.setAttribute('aria-expanded', filtrosAbertos ? 'true' : 'false');
  renderAba();
});

/* ------------------------------- capítulos ------------------------------- */

function popularCapitulos() {
  const obra = el.fObra.value;
  const b = OBROS.get(obra);
  const sel = el.fCap;
  const anterior = sel.value;
  sel.innerHTML = '<option value="">Todos</option>';
  if (!b) return;
  for (const c of b.chapters) {
    const o = document.createElement('option');
    o.value = String(c.n);
    o.textContent = `${c.title} (${c.start}–${c.end})`;
    sel.append(o);
  }
  sel.value = anterior;
}

/* -------------------------------- eventos -------------------------------- */

let tmr;
el.q.addEventListener('input', () => {
  clearTimeout(tmr);
  tmr = setTimeout(() => {
    termos = normalizar(el.q.value).split(/\s+/).filter(Boolean);
    renderAba();
  }, 120);
});

// os filtros valem na página em que o usuário está: não pulam de aba
for (const c of [el.fObra, el.fCap]) {
  c.addEventListener('change', () => {
    if (c === el.fObra) popularCapitulos();
    renderAba();
  });
}

document.addEventListener('keydown', (e) => {
  if (el.dlg.open) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); navegar(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navegar(1); }
  }
});

/* --------------------------------- início -------------------------------- */

for (const b of DATA.books) {
  const o = document.createElement('option');
  o.value = b.slug;
  o.textContent = b.title;
  el.fObra.append(o);
}
atualizarCont();
aplicarEstado();   // parte do zero: sem termo de busca nem filtros
renderAba();
