document.addEventListener('DOMContentLoaded', () => {    
    
  // ====== Mapa base    
  const map = L.map('map', { minZoom: 10, maxZoom: 18, preferCanvas: true }).setView([-7.192, -48.207], 12);    
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);    
    
  // ====== Desenho + edição (não perde no refresh)    
  let drawLayer = L.featureGroup().addTo(map);    
  const drawControl = new L.Control.Draw({    
    position: 'topleft',    
    draw: { polygon:{allowIntersection:false,showArea:true}, rectangle:true, circle:false, marker:false, polyline:false, circlemarker:false },    
    edit: { featureGroup: drawLayer, remove: true }    
  });    
  map.addControl(drawControl);

  // ===== Toggle de edição — esconde contornos azuis quando não estiver editando
  let editMode = false;
  function setEditMode(on){
    editMode = !!on;
    const toolbar = document.querySelector('.leaflet-draw');
    if (editMode) {
      if (!map.hasLayer(drawLayer)) map.addLayer(drawLayer);
      if (toolbar) toolbar.style.display = '';
    } else {
      if (map.hasLayer(drawLayer)) map.removeLayer(drawLayer);
      if (toolbar) toolbar.style.display = 'none';
    }
  }
  // botão ✏️ para alternar edição
  L.Control.EditToggle = L.Control.extend({
    onAdd: function() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const btn = L.DomUtil.create('a', '', div);
      btn.href = '#';
      btn.title = 'Editar bairros (E)';
      btn.innerHTML = '✏️';
      L.DomEvent.on(btn, 'click', (e)=>{ L.DomEvent.stop(e); setEditMode(!editMode); });
      return div;
    },
    onRemove: function() {}
  });
  (new L.Control.EditToggle({ position: 'topleft' })).addTo(map);
  // atalho de teclado
  document.addEventListener('keydown', (ev)=>{ if(ev.key.toLowerCase()==='e') setEditMode(!editMode); });
  // começa em visualização (sem contornos)
  setEditMode(false);
    
  let bairrosDataCustom = { type:"FeatureCollection", features:[] };    
  const LS_KEY = "bairros_custom_geojson";    
  function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(bairrosDataCustom)); }catch(e){} }    
  function loadLocal(){ try{ const raw=localStorage.getItem(LS_KEY); if(!raw) return null; const gj=JSON.parse(raw); return (gj && gj.features)? gj : null; }catch(e){ return null; } }    
  function renderCustomIntoDrawLayer(){    
    drawLayer.clearLayers();    
    L.geoJSON(bairrosDataCustom, { onEachFeature:(f,ly)=>{    
      const nm = (f.properties?.nome||'Área');    
      ly.bindTooltip(document.getElementById('chkLabels')?.checked ? nm : '', {permanent:false, direction:'center', className:'label'});    
      ly.bindPopup(`<strong>${nm}</strong>`);    
      drawLayer.addLayer(ly);    
    }});    
  }    

  // ===== Normalizar nome + filtrar só bairros com dado da aba  
  function normName(s){ return (s||'').trim().toLowerCase(); }  
  function filteredFeatureCollectionByDict(dict){  
    const withData = new Set(Object.keys(dict||{}).map(normName));  
    const feats = (bairrosDataCustom.features||[]).filter(f=>{  
      const n = normName(f.properties?.nome);  
      return withData.has(n);  
    });  
    return { type:"FeatureCollection", features: feats };  
  }  

  // ---- nomes desenhados
  function drawnNameSet(){
    const s = new Set();
    (bairrosDataCustom.features || []).forEach(f=>{
      const n = normName(f.properties?.nome);
      if(n) s.add(n);
    });
    return s;
  }
  // ---- faltantes (no dataset da aba, mas não desenhados)
  function computeMissing(dict){
    const drawn = drawnNameSet();
    const miss = [];
    for (const [nome, info] of Object.entries(dict || {})){
      if (!drawn.has(normName(nome))){
        miss.push({ nome, info });
      }
    }
    miss.sort((a,b)=> (b.info.percent||0) - (a.info.percent||0));
    return miss;
  }
    
  // ===== Carrega do navegador (se já houver)    
  const stored=loadLocal();   
  if(stored){   
    bairrosDataCustom=stored;   
    renderCustomIntoDrawLayer();   
  }    
    
  // ===== Eventos desenho    
  map.on(L.Draw.Event.CREATED, e=>{    
    const layer=e.layer;    
    const nome=prompt("Nome do bairro/setor:");    
    if(!nome) return;    
    layer.feature={ type:"Feature", properties:{ nome:nome }, geometry: layer.toGeoJSON().geometry };    
    drawLayer.addLayer(layer);    
    bairrosDataCustom.features.push(layer.feature);    
    layer.bindPopup(`<strong>${nome}</strong>`);    
    saveLocal();    
  });    
  map.on(L.Draw.Event.EDITED, ()=>rebuildFromDrawLayer());    
  map.on(L.Draw.Event.DELETED, ()=>rebuildFromDrawLayer());    
  function rebuildFromDrawLayer(){    
    const feats=[];    
    drawLayer.eachLayer(l=>{    
      if(l.toGeoJSON){    
        const gj=l.toGeoJSON();    
        const nome=(l.feature&&l.feature.properties&&l.feature.properties.nome) || (gj.properties&&gj.properties.nome) || 'Área';    
        feats.push({type:'Feature', properties:{nome}, geometry:gj.geometry});    
      }    
    });    
    bairrosDataCustom={type:'FeatureCollection',features:feats};    
    saveLocal();    
  }    
    
  // ===== Botões Importar/Salvar/Restaurar/Limpar    
  const importInput=document.createElement('input');   
  importInput.type='file';   
  importInput.accept='.geojson,.json';   
  importInput.style.display='none';   
  document.body.appendChild(importInput);    
    
  document.getElementById('btnSave')?.addEventListener('click', ()=>{    
    const data=JSON.stringify(bairrosDataCustom);    
    const blob=new Blob([data],{type:'application/json'});    
    const url=URL.createObjectURL(blob);    
    const a=document.createElement('a');   
    a.href=url;   
    a.download='bairros_custom.geojson';   
    a.click();   
    URL.revokeObjectURL(url);    
  });    
    
  document.getElementById('btnRestore')?.addEventListener('click', ()=>{   
    const gj=loadLocal();   
    if(!gj) return alert('Nada salvo.');   
    bairrosDataCustom=gj;   
    renderCustomIntoDrawLayer();   
    alert('Restaurado!');   
  });    
    
  document.getElementById('btnImport')?.addEventListener('click', ()=>importInput.click());    
    
  document.getElementById('btnClear')?.addEventListener('click', ()=>{   
    if(confirm('Limpar todos os desenhos?')){   
      bairrosDataCustom={type:'FeatureCollection',features:[]};   
      renderCustomIntoDrawLayer();   
      saveLocal();   
    }   
  });    
    
  importInput.addEventListener('change', (ev)=>{    
    const f=ev.target.files[0]; if(!f) return;    
    const r=new FileReader();    
    r.onload=()=>{   
      try{   
        const gj=JSON.parse(r.result);   
        if(!gj||!gj.features) throw new Error('GeoJSON inválido');   
        bairrosDataCustom=gj;   
        renderCustomIntoDrawLayer();   
        saveLocal();   
        alert('Importado!');   
      }catch(e){   
        alert('Erro: '+e.message);  
      }   
    };    
    r.readAsText(f);    
  });    
    
  // ===== Thematic painter per tab    
  let bairrosLayer=null, heatLayer=null;    
  const chkHeat=document.getElementById('chkHeat');    
  const chkLabels=document.getElementById('chkLabels');    
  chkLabels?.addEventListener('change', ()=>renderCustomIntoDrawLayer());    
    
  function colorByLevel(nivel){    
    switch((nivel||'').toLowerCase()){    
      case 'alta': return '#e11d48';    
      case 'media-alta': return '#f59e0b';    
      case 'media': return '#f97316';    
      case 'media-baixa': return '#eab308';    
      case 'baixa': return '#22c55e';    
      case 'muito-baixa': return '#3b82f6';    
      default: return '#6b7280';    
    }    
  }    
    
  function styleFromDict(dict){    
    return function(feature){    
      const nome=(feature.properties?.nome||'').trim();    
      const info=dict[nome];    
      const nivel = info?.nivel || info?.status || null;    
      return { color:'#ffffff', weight:1.2, fillColor: colorByLevel(nivel), fillOpacity: 0.55 };    
    };    
  }    
    
  function popupFromDict(dict, extraBuilder){    
    return function(feature, layer){    
      const nome=(feature.properties?.nome||'Bairro').trim();    
      const info=dict[nome];    
      if(!info){   
        layer.bindPopup(`<strong>${nome}</strong><br>Sem dados.`);   
        return;   
      }    
      const nivel = info.nivel || info.status || '-';    
      const parts=[`<span style="color:${colorByLevel(nivel)};text-transform:capitalize">Nível: ${nivel}</span>`];    
      if(info.percent!=null) parts.push(`<small>Incidência: ${info.percent}%</small>`);    
      const extra = extraBuilder? extraBuilder(info):'';    
      if(extra) parts.push(extra);    
      layer.bindPopup(`<strong>${nome}</strong><br>${parts.join('<br>')}`);    
      layer.on('click', ()=>updateMiniChart(nome, info));    
    }    
  }    
    
  function centroidOf(feature){    
    try{    
      const coords=feature.geometry.coordinates[0];    
      let sx=0, sy=0, n=coords.length;    
      coords.forEach(c=>{ sx+=c[1]; sy+=c[0]; }); // lat, lon    
      return [sx/n, sy/n];    
    }catch(e){ return null; }    
  }    
    
  // ===== Heat só com bairros que têm dado na aba  
  function buildHeat(dict){    
    if(heatLayer){ map.removeLayer(heatLayer); heatLayer=null; }    
    if(!chkHeat || !chkHeat.checked) return;    
    if(!bairrosDataCustom.features.length) return;    
    
    const fonte = filteredFeatureCollectionByDict(dict);
    const pts=[];    
    fonte.features.forEach(f=>{    
      const nome=(f.properties?.nome||'').trim();    
      const info=dict[nome] || dict[Object.keys(dict).find(k=>normName(k)===normName(nome))];    
      if(!info) return;    
      const c=centroidOf(f);    
      if(!c) return;    
      const weight = info.percent? (info.percent/100) : 0.3;    
      pts.push([c[0], c[1], Math.min(1, Math.max(0.05, weight))]);    
    });    
    if(pts.length){    
      heatLayer = L.heatLayer(pts, { radius: 25, blur: 18, maxZoom: 17, minOpacity: 0.4 }).addTo(map);    
    }    
  }    
    
  // Ranking lateral (APENAS a barra colorida)
  function renderRanking(dict){
    const el=document.getElementById('ranking');
    if(!el){ return; }
    const arr=Object.entries(dict).map(([nome,info])=>({
      nome,
      percent: info.percent || 0,
      nivel: info.nivel || info.status || '-'
    }));
    arr.sort((a,b)=>(b.percent||0)-(a.percent||0));
    const top=arr.slice(0,10);

    el.innerHTML = top.map(r=>{
      const barColor = colorByLevel(r.nivel);
      const w = Math.min(100, Math.max(1, r.percent || 1));
      return `
        <div class="rank-row">
          <div class="name" title="${r.nome}">${r.nome}</div>
          <div class="bar onlycolor" style="--barColor:${barColor}">
            <span class="fill" style="width:${w}%"></span>
          </div>
          <div class="val">${r.percent||0}%</div>
        </div>`;
    }).join('');
  }
    
  // Mini chart    
  let miniChart=null;    
  function updateMiniChart(nome, info){    
    const ctx=document.getElementById('miniChart').getContext('2d');    
    const dataVal = info.percent || 0;    
    const rest = Math.max(0, 100 - dataVal);    
    const color=colorByLevel(info.nivel||info.status);    
    if(miniChart){ miniChart.destroy(); }    
    miniChart = new Chart(ctx, {    
      type:'doughnut',    
      data:{ labels:['Incidência',''],    
             datasets:[{ data:[dataVal,rest], backgroundColor:[color,'#0b1220'] }]},    
      options:{ plugins:{legend:{display:false}}, cutout:'65%' }  
    });    
    const extraLines=[];    
    if(info.justificativa) extraLines.push(`<em>${info.justificativa}</em>`);    
    if(info.observacoes) extraLines.push(`<em>${info.observacoes}</em>`);    
    if(info.tipos) extraLines.push(`<small>Tipos: ${info.tipos}</small>`);    
    if(info.tipo) extraLines.push(`<small>Tipo: ${info.tipo}</small>`);    
    if(info.men!=null) extraLines.push(`<small>Menções: ${info.men}</small>`);    
    document.getElementById('miniInfo').innerHTML = `<strong>${nome}</strong><br>${extraLines.join('<br>')}`;    
  }    

  // ===== UI "Faltando no mapa" (modal + badge)
  const btnMissing   = document.getElementById('btn-missing');
  const badgeMissing = document.getElementById('missing-badge');
  const missingModal = document.getElementById('missingModal');
  const closeMissing = document.getElementById('closeMissing');
  const missingList  = document.getElementById('missingList');

  function openMissing(){ 
    if(!missingModal) return;
    missingModal.classList.add('open'); 
    missingModal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function closeMissingFn(){ 
    if(!missingModal) return;
    missingModal.classList.remove('open'); 
    missingModal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  }
  if (btnMissing)   btnMissing.addEventListener('click', openMissing);
  if (closeMissing) closeMissing.addEventListener('click', closeMissingFn);
  if (missingModal) missingModal.addEventListener('click', (ev)=>{ if(ev.target===missingModal) closeMissingFn(); });
  document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape' && missingModal?.classList.contains('open')) closeMissingFn(); });

  function renderMissingList(dict){
    if(!missingList || !badgeMissing) return;
    const miss = computeMissing(dict);

    if (miss.length > 0){
      badgeMissing.classList.remove('hidden');
      badgeMissing.textContent = String(miss.length);
    } else {
      badgeMissing.classList.add('hidden');
    }

    missingList.innerHTML = miss.map(({nome, info})=>{
      const nivel = (info.nivel || info.status || '-');
      const cor = colorByLevel(nivel);
      const pct = (info.percent!=null) ? ` — <strong>${info.percent}%</strong>` : '';
      const just = info.justificativa || info.observacoes || '';
      return `
        <li style="margin:8px 0; line-height:1.35">
          <div style="display:flex; align-items:center; gap:8px">
            <span style="width:12px;height:12px;border-radius:3px;background:${cor};display:inline-block;border:1px solid rgba(0,0,0,.25)"></span>
            <strong>${nome}</strong>${pct}
          </div>
          ${just ? `<div style="color:#9fb0c3;font-size:12px;margin-left:20px">${just}</div>` : ``}
        </li>`;
    }).join('');
  }
    
  // ===== Carregar e pintar por aba    
  let currentDict=null;    
  async function loadAndPaint(url){    
    const res = await fetch(url);   
    let dict = await res.json();   

    // Se for Criminalidade Geral, garante os dois bairros na lista de dados
    if (/criminalidade_geral\.json$/i.test(url)) {
      dict = ensureCgExtras(dict);
    }

    currentDict = dict;    
    if(bairrosLayer){ map.removeLayer(bairrosLayer); bairrosLayer=null; }    

    // sempre volta para visualização (sem contornos azuis)
    setEditMode(false);

    // Só desenha bairros que têm dado nesta aba  
    const fonteFiltrada = filteredFeatureCollectionByDict(dict);  
    if(!fonteFiltrada.features.length){    
      const rEl = document.getElementById('ranking');
      if (rEl) {
        rEl.innerHTML = '<div class="muted">Nenhum bairro desta aba foi encontrado nos seus desenhos (ou o nome não bate).</div>';
      }
    }    
    
    bairrosLayer = L.geoJSON(fonteFiltrada, {  
      style: styleFromDict(dict),  
      onEachFeature: popupFromDict(dict)  
    }).addTo(map);  
    
    try{ map.fitBounds(bairrosLayer.getBounds(), {padding:[20,20]}); }catch(e){}    
    renderRanking(dict);    
    buildHeat(dict);    
    renderMissingList(dict); // atualiza painel “Faltando no mapa”
  }    
    
  const chkHeatEl = document.getElementById('chkHeat');  
  if (chkHeatEl) {  
    chkHeatEl.addEventListener('change', ()=>{ if(currentDict) buildHeat(currentDict); });  
  }  
      
  // Abas    
  const tabs=document.querySelectorAll('.tab');    
  const panels=document.querySelectorAll('.tab-panel');    

  // ====== (NOVO) Legenda móvel: pega a legenda e encaixa no slot da aba ativa
  const legendEl = document.getElementById('legend-levels');
  function mountLegendFor(key){
    if (!legendEl) return;
    const slot = document.querySelector(`.tab-panel[data-panel="${key}"] .legend-slot`);
    if (!slot) return;
    slot.innerHTML = '';
    slot.appendChild(legendEl);
    legendEl.style.display = 'block';
  }

  function setActiveTab(key){    
    tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===key));    
    panels.forEach(p=>p.style.display = (p.dataset.panel===key ? 'block' : 'none'));    

    // 👇 move a legenda para o painel ativo (fica acima do ranking)
    mountLegendFor(key);

    const urls={    
      'vd':'data/violencia_domestica.json',    
      'mi':'data/moradia_irregular.json',    
      'infra':'data/infraestrutura.json',    
      'imps':'data/incidencia_midiatica.json',    
      'vg':'data/violencia_geral.json',    
      'psr':'data/situacao_rua.json',    
      'cg':'data/criminalidade_geral.json'    
    };    
    loadAndPaint(urls[key]);    
  }    

  tabs.forEach(tab=>tab.addEventListener('click',()=>setActiveTab(tab.dataset.tab)));    

  // inicia em VD + já monta a legenda no lugar
  setActiveTab('vd');    
    
  // Créditos (modal)    
  const creditsData = [    
    {name:'Aylanne Pereira Lustosa'},    
    {name:'Nicolly Alencar Luz'},    
    {name:'Tales Andrade Oliveira'},    
    {name:'Gustavo de Sousa Lemes'},    
    {name:'João Pedro Dias Silva'},    
    {name:'Rainara Lima Barbosa'},    
    {name:'Giovana Almeida Benício'}    
  ];    
  const btn = document.getElementById('btn-credits');    
  const modal = document.getElementById('creditsModal');    
  const closeBtn = document.getElementById('closeCredits');    
  const list = document.getElementById('creditsList');    
  function renderCredits(){   
    if(!list) return;
    list.innerHTML='';   
    creditsData.forEach(c=>{   
      const li=document.createElement('li');   
      li.textContent=c.name;   
      list.appendChild(li);   
    });   
  }    
  function openModal(){ if(!modal) return; renderCredits(); modal.classList.add('open'); document.body.style.overflow='hidden'; }    
  function closeModal(){ if(!modal) return; modal.classList.remove('open'); document.body.style.overflow=''; }    
  if(btn && modal){   
    btn.addEventListener('click',openModal);   
    if(closeBtn) closeBtn.addEventListener('click',closeModal);   
    modal.addEventListener('click',e=>{ if(e.target===modal) closeModal(); });   
  }    
  
  // ====== Carregar automaticamente o arquivo bairros_custom.geojson em produção  
  async function tryLoadFromFile() {  
    try {  
      const res = await fetch('data/bairros_custom.geojson', { cache: 'no-store' });  
      if (res.ok) {  
        const gj = await res.json();  
        if (gj && gj.features) {  
          bairrosDataCustom = gj;  
          renderCustomIntoDrawLayer();  
          saveLocal();  
          console.log('✅ Bairros carregados de data/bairros_custom.geojson');  
        }  
      } else {  
        console.log('ℹ️ Nenhum data/bairros_custom.geojson encontrado (ok enquanto você estiver desenhando).');  
      }  
    } catch (e) {  
      console.warn('⚠️ Erro ao carregar bairros_custom.geojson:', e);  
    }  
  }  
  tryLoadFromFile();  
});
