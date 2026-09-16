const API='/api'; let currentDraftId=null;
let currentCaseAnalysis=null;
let activeProfile={display_name:'Pengguna LexiCore',configured:false};
function applyProfileIdentity(p){activeProfile=p||activeProfile;const name=activeProfile.display_name||'Pengguna LexiCore';const mark=(activeProfile.watermark_text||name||'USER').replace(/[^A-Za-z0-9]/g,'').slice(0,8).toUpperCase()||'USER';[['brandMarkUser',mark],['brandFirmLine',name],['sideFirmName',name],['ownershipFirmName',name],['busyFirmName',name]].forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.textContent=v;});const firmWrap=document.querySelector('.side-foot-firm');if(firmWrap)firmWrap.title='User/Firm identity: '+name;}
async function loadProfile(){try{const r=await fetch('/api/profile');const j=await r.json();if(j.success){applyProfileIdentity(j.data);if(j.data.first_run_required){try{await fetch('/api/profile',{method:'POST'});}catch(_){} openProfileModal(true);}}}catch(_){}}
let desktopLicenseState=null;
function renderLicenseState(state){desktopLicenseState=state||{};const badge=document.getElementById('licenseStatusBadge');const modal=document.getElementById('licenseModal');const status=document.getElementById('licenseActivationStatus');const iid=document.getElementById('licenseInstallationId');const allowed=!!desktopLicenseState.allowed;const label=desktopLicenseState.status||'UNKNOWN';if(iid&&desktopLicenseState.installation_id)iid.value=desktopLicenseState.installation_id;if(badge){const badgeText='Lisensi: '+label.replaceAll('_',' ');badge.textContent=badgeText;badge.title=badgeText;badge.classList.toggle('ok',allowed);}if(status){const exp=desktopLicenseState.expires_at?` · Berlaku s.d. ${desktopLicenseState.expires_at}`:'';status.textContent=(desktopLicenseState.message||label)+exp;}if(modal){modal.classList.toggle('open',!allowed);modal.setAttribute('aria-hidden',allowed?'true':'false');}return allowed;}
async function loadDesktopLicense(){try{const r=await fetch('/api/license/status');const j=await r.json();const state=j.data||j.license||{};const allowed=renderLicenseState(state);if(allowed)await loadProfile();return allowed;}catch(e){renderLicenseState({status:'BLOCKED',allowed:false,message:'Gagal memeriksa lisensi lokal: '+(e.message||e),needs_activation:true});return false;}}
async function copyInstallationId(){const input=document.getElementById('licenseInstallationId');if(!input?.value)return;try{await navigator.clipboard.writeText(input.value);toast('Installation ID disalin');}catch(_){input.select();document.execCommand('copy');toast('Installation ID disalin');}}
async function installDesktopLicense(){const input=document.getElementById('licenseFileInput');const btn=document.getElementById('licenseInstallButton');const status=document.getElementById('licenseActivationStatus');const file=input?.files?.[0];if(!file){if(status)status.textContent='Pilih file lisensi .json atau .lic.';return;}if(btn)btn.disabled=true;if(status)status.textContent='Memverifikasi tanda tangan dan perangkat...';try{const text=await file.text();let envelope;try{envelope=JSON.parse(text)}catch(_){throw new Error('File lisensi tidak valid');}const r=await fetch('/api/license/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({license:envelope})});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error||j.data?.message||'Lisensi ditolak');if(input)input.value='';if(renderLicenseState(j.data)){await loadProfile();toast('Lisensi offline LexiCore aktif pada perangkat ini');}}catch(e){if(status)status.textContent=e.message||'Aktivasi gagal';}finally{if(btn)btn.disabled=false;}}
let profileModalAutoPrompt=false;
function openProfileModal(autoPrompt=false){profileModalAutoPrompt=!!autoPrompt;const p=activeProfile||{};const title=document.getElementById('profileModalTitle');if(title)title.textContent=autoPrompt?'Pengaturan Awal Identitas Pengguna / Firma':'Profil Pengguna / Firma';document.getElementById('profileProfessionalName').value=p.professional_name||'';document.getElementById('profileFirmName').value=p.firm_name||'';document.getElementById('profileCredentials').value=p.credentials||'';document.getElementById('profileEmail').value=p.email||'';document.getElementById('profileOfficeAddress').value=p.office_address||'';document.getElementById('profilePhone').value=p.phone||'';document.getElementById('profileWatermark').value=p.watermark_text||'';const m=document.getElementById('profileModal');m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.classList.add('profile-modal-open');}
function closeProfileModal(){profileModalAutoPrompt=false;const m=document.getElementById('profileModal');m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.classList.remove('profile-modal-open');}
async function saveProfile(){const payload={professional_name:profileProfessionalName.value.trim(),firm_name:profileFirmName.value.trim(),credentials:profileCredentials.value.trim(),email:profileEmail.value.trim(),office_address:profileOfficeAddress.value.trim(),phone:profilePhone.value.trim(),watermark_text:profileWatermark.value.trim(),branding_mode:'co_brand'};if(!payload.professional_name&&!payload.firm_name){profileStatus.textContent='Isi minimal nama profesional atau nama firma.';return;}profileStatus.textContent='Menyimpan...';try{const r=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!j.success)throw new Error(j.error||'Gagal menyimpan profil');applyProfileIdentity(j.data);profileStatus.textContent='Profil tersimpan dan aktif untuk identitas aplikasi serta export.';setTimeout(closeProfileModal,450);}catch(e){profileStatus.textContent=e.message||'Gagal menyimpan profil';}}
window.addEventListener('DOMContentLoaded',()=>{loadDesktopLicense();
  caseNarrative?.addEventListener('input',syncCaseProcessStrip);
  caseFile?.addEventListener('change',()=>{caseFileUploadStored=false;});
  caseFile?.addEventListener('change',syncCaseProcessStrip);
  caseRegulatoryMode?.addEventListener('change',syncCaseProcessStrip);
  syncCaseProcessStrip();
  updateClientLegalPosition();
});
function syncFrozenHeaderHeight(){
  const root=document.documentElement;
  const side=document.querySelector('.side');
  const stack=document.getElementById('workspaceFrozenStack');
  const narrow=window.matchMedia('(max-width:1000px)').matches;
  const primaryH=narrow&&side?Math.ceil(side.getBoundingClientRect().height):0;
  const stackH=narrow&&stack?Math.ceil(stack.getBoundingClientRect().height):0;
  root.style.setProperty('--mobile-frozen-header-h',primaryH+'px');
  root.style.setProperty('--workspace-stack-h',stackH+'px');
}
function syncWorkspaceSubnav(){
  const host=document.getElementById('workspaceSubnavHost');
  if(!host) return;
  const activeId=document.body.dataset.activePanel||document.querySelector('.panel.active')?.id||'';
  host.querySelectorAll('.panel-section-nav[data-panel-owner]').forEach(nav=>{
    nav.hidden=nav.dataset.panelOwner!==activeId;
  });
  requestAnimationFrame(syncFrozenHeaderHeight);
}
const frozenSide=document.querySelector('.side');
const frozenStack=document.getElementById('workspaceFrozenStack');
if('ResizeObserver' in window){
  const headerRO=new ResizeObserver(()=>requestAnimationFrame(syncFrozenHeaderHeight));
  if(frozenSide) headerRO.observe(frozenSide);
  if(frozenStack) headerRO.observe(frozenStack);
}
window.addEventListener('resize',()=>requestAnimationFrame(syncFrozenHeaderHeight),{passive:true});
window.addEventListener('orientationchange',()=>requestAnimationFrame(syncFrozenHeaderHeight),{passive:true});
requestAnimationFrame(()=>requestAnimationFrame(syncFrozenHeaderHeight));
 const titles={client:['Client / Intake & Matter','Mulai dari identitas klien, matter, komunikasi, dan pilihan layanan jasa hukum.'],draft:['Legal Drafting / Authority','Susun Surat Kuasa atau dokumen hukum yang menjadi dasar/hasil pekerjaan sesuai kebutuhan matter.'],review:['Contract Review','Tinjau kontrak sebagai pekerjaan hukum tersendiri; modul ini bukan engagement gate.'],case:['Case Analysis','Evidence-to-Action: fakta, bukti, isu, hukum yang berlaku, unsur, kausalitas, risiko, dan tindakan.'],corpus:['Regulatory Corpus','Workspace regulasi perkara: sumber resmi dan corpus yang mendukung analisis.'],risk:['Compliance & Risk Assessment','Nilai exposure dan mitigasi berdasarkan konteks serta hasil analisis yang tersedia.'],research:['Legal Research & Case Summaries','Research mendukung dan memverifikasi kebutuhan yang muncul dari Case Analysis.'],norm:['Norm Conflict Analysis','Uji antinomi, lex superior, lex specialis, lex posterior, dan transisi temporal bila relevan.']};
let toastTimer=null;
function toast(m){let t=document.getElementById('toast');clearTimeout(toastTimer);t.className='toast';t.textContent=m;t.classList.add('show');toastTimer=setTimeout(()=>t.classList.remove('show'),2600)}
function openCaseWorkingPaper(){
  const btn=document.querySelector('.panel-section-nav[data-panel-owner="case"] .panel-section-btn:nth-child(3)');
  if(btn) btn.click();
  requestAnimationFrame(()=>{const target=document.getElementById('caseReadiness');if(target)target.scrollIntoView({behavior:'smooth',block:'start'});});
}
function markCaseWorkingPaperReady(){
  const btn=document.querySelector('.panel-section-nav[data-panel-owner="case"] .panel-section-btn:nth-child(3)');
  if(btn) btn.classList.add('analysis-ready');
}
function showCaseAnalysisCompleteNotice(){
  const t=document.getElementById('toast');clearTimeout(toastTimer);markCaseWorkingPaperReady();
  t.className='toast case-complete show';
  t.innerHTML='<div class="analysis-done-toast"><div class="analysis-done-icon" aria-hidden="true">✓</div><div class="analysis-done-copy"><b>Analisis selesai</b><small>Pembacaan dokumen dan analisis awal telah selesai. Working Paper siap ditinjau.</small></div><button class="analysis-done-action" type="button" onclick="openCaseWorkingPaper()">Lihat Working Paper</button></div>';
  toastTimer=setTimeout(()=>{t.classList.remove('show');},9000);
}
let busyDepth=0,busyStarted=0,busyTimer=null,busyProgressMode=false,busyProgressValue=0;
function setBusyProgress(percent,label,detail){
  busyProgressMode=true;busyProgressValue=Math.max(0,Math.min(100,Number(percent)||0));
  const bar=document.getElementById('busyBar');if(bar){bar.classList.add('progress');bar.style.setProperty('--busy-progress',busyProgressValue+'%')}
  busyElapsed.textContent=Math.round(busyProgressValue)+'%';
  if(label)busyTitle.textContent=label;if(detail)busyText.textContent=detail;
  if(label)processChipText.textContent=label+' · '+Math.round(busyProgressValue)+'%';
}
function resetBusyProgress(){busyProgressMode=false;busyProgressValue=0;const bar=document.getElementById('busyBar');if(bar){bar.classList.remove('progress');bar.style.removeProperty('--busy-progress')}}
function setBusy(on,label='LexiCore sedang memproses'){
 const overlay=document.getElementById('busyOverlay'),chip=document.getElementById('processChip');
 if(on){busyDepth++;if(busyDepth>1)return;busyStarted=Date.now();resetBusyProgress();busyTitle.textContent=label;busyText.textContent='Menyiapkan proses...';busyElapsed.textContent='0%';overlay.classList.add('show');overlay.setAttribute('aria-hidden','false');chip.classList.add('show');processChipText.textContent=label;document.body.classList.add('is-busy');busyTimer=setInterval(()=>{if(busyProgressMode){busyElapsed.textContent=Math.round(busyProgressValue)+'%';return;}const s=Math.floor((Date.now()-busyStarted)/1000),soft=Math.min(9,Math.floor(s/4));busyElapsed.textContent=soft+'%'},1000)}
 else{busyDepth=Math.max(0,busyDepth-1);if(busyDepth)return;clearInterval(busyTimer);overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true');chip.classList.remove('show');document.body.classList.remove('is-busy');resetBusyProgress()}
}
async function withBusy(label,fn){setBusy(true,label);try{return await fn()}finally{setBusy(false)}}

async function json(url,opt){
  const r=await fetch(url,opt);
  const raw=await r.text();
  let d={};
  if(raw){try{d=JSON.parse(raw)}catch(_){d={success:false,error:(raw.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,500)||'Respons server bukan JSON')}}}
  if(!r.ok||d.success===false){let e=new Error(d.error||d.message||('Request gagal ('+r.status+')'));e.status=r.status;e.payload=d;throw e}
  return d
}
async function jsonWithTimeout(url,opt,timeoutMs=240000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await json(url,{...(opt||{}),signal:controller.signal})}
  catch(e){if(e&&e.name==='AbortError')throw new Error('Proses melewati batas waktu aman. LexiCore menghentikan penantian agar UI tidak terkunci; coba mode Offline atau ulangi setelah koneksi sumber resmi stabil.');throw e}
  finally{clearTimeout(timer)}
}
const panelAliases={intake:'client',client:'client',drafting:'draft',authority:'draft',contract:'review',review:'review',analysis:'case',case:'case',regulatory:'corpus',corpus:'corpus',compliance:'risk',risk:'risk',research:'research',conflict:'norm',conflicts:'norm',norm:'norm'};
function resolvePanelId(panel){
  const key=String(panel||'').trim().toLowerCase();
  return panelAliases[key]||key;
}
function activatePanel(panel){
  panel=resolvePanelId(panel);
  if(!panel || !titles[panel]) return false;
  const profileModal=document.getElementById('profileModal');
  if(profileModal&&profileModal.classList.contains('open')) closeProfileModal();
  const target=document.getElementById(panel);
  const button=document.querySelector('.nav button[data-panel="'+panel+'"]');
  if(!target || !button){ console.warn('[LexiCore navigation] target tidak ditemukan:',panel); return false; }
  document.querySelectorAll('.nav button[data-panel]').forEach(x=>{const active=x===button;x.classList.toggle('active',active);if(active)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});
  document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x===target));
  const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSub');
  if(title) title.textContent=titles[panel][0];
  if(sub) sub.textContent=titles[panel][1];
  document.body.dataset.activePanel=panel;
  syncWorkspaceSubnav();
  return true;
}
const mainNav=document.querySelector('.nav');
if(mainNav){
  mainNav.addEventListener('click',e=>{
    const b=e.target.closest('button[data-panel]');
    if(b && mainNav.contains(b)){ e.preventDefault(); activatePanel(b.dataset.panel); }
  });
  mainNav.addEventListener('keydown',e=>{
    const b=e.target.closest('button[data-panel]');
    if(b && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); activatePanel(b.dataset.panel); }
  });
}
function openPanel(panel){return activatePanel(panel)}
document.querySelectorAll('.metric[data-panel]').forEach(m=>{m.onclick=()=>openPanel(m.dataset.panel);m.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPanel(m.dataset.panel)}}});
document.getElementById('effectiveDate').value=new Date().toISOString().slice(0,10);
let draftTypeConfig={};
let draftTemplateRows=[];
const draftTemplateDetailCache=new Map();
let draftTemplateDetailRequest=0;
function renderDraftTemplateOptions(){
  const query=String(draftTemplateSearch?.value||'').trim().toLowerCase();
  const category=String(draftCategoryFilter?.value||'');
  const prev=docType.value;
  const rows=draftTemplateRows.filter(x=>(!category||x.category===category)&&(!query||[x.display_name,x.name,x.category,x.domain,x.section,x.subsection].join(' ').toLowerCase().includes(query)));
  docType.innerHTML=''; draftTypeConfig={};
  const groups={};
  rows.forEach(x=>(groups[x.category]||(groups[x.category]=[])).push(x));
  Object.keys(groups).sort((a,b)=>a.localeCompare(b,'id')).forEach(categoryName=>{
    const g=document.createElement('optgroup');g.label=categoryName;
    groups[categoryName].sort((a,b)=>String(a.display_name||a.name).localeCompare(String(b.display_name||b.name),'id')).forEach(x=>{
      const key=x.name;
      const o=document.createElement('option');o.value=key;o.textContent=x.display_name||x.name;g.appendChild(o);
      const p1=x.party1_label||x.p1||'Pihak Pertama';const p2=x.party2_label||x.p2||'Pihak Kedua';const promptText=x.prompt_label||x.prompt||'Uraikan fakta, tujuan, klausul, atau isu yang harus masuk dalam draft';
      const sources=[];
      const officialSourceCount=Number(x.official_source_count||0);
      const sourceLabel=officialSourceCount?`${officialSourceCount} rujukan resmi tersedia`:'Belum ada rujukan resmi publik yang ditautkan';
      const grade=x.source_grade||'LEXICORA_TEMPLATE';
      const warning=x.catalog_warning?(' PERINGATAN: '+x.catalog_warning):'';
      draftTypeConfig[key]={p1,p2,ph1:'Nama / identitas '+String(p1).toLowerCase(),ph2:'Nama / identitas '+String(p2).toLowerCase(),prompt:'Fakta / instruksi matter',promptPh:promptText,duration:!!x.duration,note:(x.forum_sensitive?'Verifikasi kompetensi, tenggat dan hukum acara. ':'Verifikasi fakta, kewenangan dan dasar hukum. ')+`Sumber: ${grade}. ${sourceLabel}.${warning}`,sources,officialSourceCount,displayName:x.display_name||x.name};
    });docType.appendChild(g)
  });
  if(!docType.options.length){const o=document.createElement('option');o.textContent='Tidak ada template yang cocok';o.value='';docType.appendChild(o);draftTypeNote.innerHTML='<small>Tidak ada hasil. Ubah filter atau kata pencarian.</small>';return}
  if([...docType.options].some(o=>o.value===prev))docType.value=prev;else docType.selectedIndex=0;
  updateDraftForm();
}
async function loadDraftTemplates(){
  try{
    const d=await json(API+'/drafting/templates');
    const raw=d.data??d.templates??[];
    draftTemplateRows=(Array.isArray(raw)?raw:Object.values(raw||{})).map((x,i)=>({...(x||{}),name:String(x?.name||Object.keys(raw||{})[i]||'').trim(),display_name:String(x?.display_name||x?.name||Object.keys(raw||{})[i]||'').trim(),category:x?.category||'Lainnya'})).filter(x=>x.name);
    const cats=[...new Set(draftTemplateRows.map(x=>x.category))].sort((a,b)=>String(a).localeCompare(String(b),'id'));
    draftCategoryFilter.innerHTML='<option value="">Semua klasifikasi ('+cats.length+')</option>'+cats.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join('');
    renderDraftTemplateOptions();
    if(!draftTemplateRows.length)throw new Error('Template drafting tidak tersedia');
  }catch(e){draftTemplateRows=[{name:'Perjanjian Kerjasama',display_name:'Perjanjian Kerjasama',category:'Fallback',p1:'Pihak Pertama',p2:'Pihak Kedua',prompt:'Uraikan ruang lingkup',duration:true,source_grade:'FALLBACK'}];renderDraftTemplateOptions()}
}
function updateDraftForm(){
 const c=draftTypeConfig[docType.value]||{p1:'Pihak Pertama',p2:'Pihak Kedua',ph1:'Nama pihak pertama',ph2:'Nama pihak kedua',prompt:'Fakta / instruksi',promptPh:'Uraikan fakta dan tujuan',duration:false,note:''};
 party1Label.textContent=c.p1; party2Label.textContent=c.p2; party1.placeholder=c.ph1; party2.placeholder=c.ph2;
 promptLabel.textContent=c.prompt; prompt.placeholder=c.promptPh; durationField.style.display=c.duration?'block':'none';
 const sourceLinks=(c.sources||[]).slice(0,3).map(s=>'<a href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(s.issuer)+'</a>').join(' · ');
 const sourceHint=!sourceLinks&&c.officialSourceCount?'<br><span class="draft-source-links">Rujukan resmi dimuat saat template dipilih…</span>':'';
 draftTypeNote.innerHTML='<small><b>'+escapeHtml(c.displayName||docType.value)+'</b> — '+escapeHtml(c.note)+(sourceLinks?'<br><span class="draft-source-links">Rujukan resmi: '+sourceLinks+'</span>':sourceHint)+'</small>';
 void loadSelectedDraftTemplateDetail();
}
async function loadSelectedDraftTemplateDetail(){
 const key=String(docType?.value||'').trim(); if(!key)return;
 const cfg=draftTypeConfig[key]; if(!cfg)return;
 if(draftTemplateDetailCache.has(key)){
   const detail=draftTemplateDetailCache.get(key); cfg.sources=Array.isArray(detail?.official_source_details)?detail.official_source_details:[]; cfg.officialSourceCount=cfg.sources.length; renderSelectedDraftTemplateSources(key,cfg); return;
 }
 if(!cfg.officialSourceCount)return;
 const requestId=++draftTemplateDetailRequest;
 try{
   const d=await json(API+'/drafting/template/'+encodeURIComponent(key));
   const detail=d.template||{}; draftTemplateDetailCache.set(key,detail);
   if(requestId!==draftTemplateDetailRequest||String(docType?.value||'')!==key)return;
   cfg.sources=Array.isArray(detail.official_source_details)?detail.official_source_details:[]; cfg.officialSourceCount=cfg.sources.length; renderSelectedDraftTemplateSources(key,cfg);
 }catch(_){ /* metadata links are non-blocking */ }
}
function renderSelectedDraftTemplateSources(key,cfg){
 if(String(docType?.value||'')!==key)return;
 const sourceLinks=(cfg.sources||[]).slice(0,3).map(s=>'<a href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(s.issuer)+'</a>').join(' · ');
 if(sourceLinks) draftTypeNote.innerHTML='<small><b>'+escapeHtml(cfg.displayName||key)+'</b> — '+escapeHtml(cfg.note)+'<br><span class="draft-source-links">Rujukan resmi: '+sourceLinks+'</span></small>';
}
loadDraftTemplates();
updateClientServiceMode();
function selectedDraftDisplayName(){
  const cfg=draftTypeConfig[docType.value];
  if(cfg?.displayName)return String(cfg.displayName).trim();
  const opt=docType.options[docType.selectedIndex];
  return String(opt?.textContent||docType.value||'Dokumen Hukum').trim();
}
async function selectDraftTemplateFromRecord(x){
  if(!docType?.options?.length)await loadDraftTemplates();
  const candidates=[x?.template_key,x?.doc_type].filter(Boolean).map(String);
  let option=[...docType.options].find(o=>candidates.includes(o.value));
  if(!option && x?.doc_type) option=[...docType.options].find(o=>String(o.textContent||'').trim()===String(x.doc_type).trim());
  if(!option && x?.template_key){
    draftTemplateSearch.value=String(x.template_key); renderDraftTemplateOptions();
    option=[...docType.options].find(o=>o.value===String(x.template_key));
  }
  if(option){docType.value=option.value;updateDraftForm();return true}
  return false;
}
async function generateDraft(){return withBusy('Menyusun draft hukum',async()=>{try{let d=await json(API+'/generate/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({doc_type:docType.value,party1:party1.value,party2:party2.value,effective_date:effectiveDate.value,duration:duration.value,prompt:prompt.value})});currentDraftId=d.draft_id;draftPreview.textContent=d.content;toast('Draft berhasil dibuat');loadAll()}catch(e){toast(e.message)}})}
async function saveDraft(){let content=draftPreview.textContent;if(content.length<50)return toast('Belum ada draft untuk disimpan');return withBusy('Menyimpan draft',async()=>{try{const displayName=selectedDraftDisplayName();const payload={title:displayName+' — '+(party1.value||'Draft'),doc_type:displayName,template_key:docType.value,party1:party1.value,party2:party2.value,effective_date:effectiveDate.value,duration:+duration.value,prompt:prompt.value,content,word_count:content.split(/\s+/).length,clause_count:(content.match(/PASAL \d+/g)||[]).length,status:'saved'};if(currentDraftId){await json(API+'/drafts/'+currentDraftId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});toast('Draft diperbarui tanpa membuat record ganda')}else{let d=await json(API+'/drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});currentDraftId=d.draft_id;toast('Draft disimpan')}await loadAll()}catch(e){toast(e.message)}})}
function exportDocx(){if(!currentDraftId)return toast('Generate atau simpan draft terlebih dahulu');window.location=API+'/drafts/'+currentDraftId+'/export/docx'}
function escapeHtml(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]))}
function printDraft(){
  const content=(draftPreview.textContent||'').trim();
  if(!content || content==='Draft akan muncul di sini.') return toast('Generate draft terlebih dahulu');
  const title=selectedDraftDisplayName();
  const client=(party1.value||'').trim();
  const other=(party2.value||'').trim();
  const date=(effectiveDate.value||'').trim();
  const meta=[client&&`Klien/Pihak: ${client}`,other&&`Pihak lainnya: ${other}`,date&&`Tanggal efektif: ${date}`].filter(Boolean);
  const w=window.open('','_blank','width=900,height=700');
  if(!w) return toast('Popup diblokir browser. Izinkan popup untuk Print / PDF.');
  w.document.open();
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4;margin:22mm 20mm 22mm 22mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111}
    body{font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:1.55}
    .sheet{width:100%;margin:0 auto}
    .print-head{border-bottom:1px solid #b8b8b8;padding-bottom:8mm;margin-bottom:9mm}
    .brand{font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.08em;text-transform:uppercase;color:#56606b;margin-bottom:3mm}
    h1{font-size:15pt;text-align:center;margin:0 0 3mm;text-transform:uppercase;letter-spacing:.02em}
    .meta{font-family:Arial,sans-serif;font-size:8.5pt;color:#555;text-align:center;line-height:1.45}
    .doc{white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;text-align:justify;font-size:12pt;line-height:1.6}
    .verify{margin-top:12mm;padding-top:5mm;border-top:1px solid #ddd;font-family:Arial,sans-serif;font-size:8pt;color:#777}
    @media print{.sheet{width:auto}.verify{break-inside:avoid}}
  


/* v1.3.13.10 progressive Compliance & Risk controls */
.custom-risk-manager{margin-top:18px;padding-top:16px;border-top:1px solid #e7ecf2}
.custom-risk-list{display:grid;gap:10px;margin:10px 0 14px}
.custom-risk-item{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
.custom-risk-item b{display:block;color:#10223a}.custom-risk-item small{display:block;margin-top:4px;color:#69788c}
.custom-risk-editor{border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:12px 14px}.custom-risk-editor summary{cursor:pointer;font-weight:700;color:#193552}
.risk-profile-overview{display:grid;grid-template-columns:170px 1fr;gap:18px;align-items:center;margin-bottom:18px}
.risk-score-gauge{--risk:0;display:grid;place-items:center;width:150px;height:150px;border-radius:50%;background:conic-gradient(#c89a38 calc(var(--risk)*1%),#edf1f5 0);position:relative;margin:auto}
.risk-score-gauge:before{content:'';position:absolute;inset:14px;background:#fff;border-radius:50%}.risk-score-gauge .inner{position:relative;text-align:center;z-index:1}.risk-score-gauge strong{font:700 32px Georgia,serif;color:#10223a}.risk-score-gauge span{display:block;font-size:12px;color:#6c7a8c;margin-top:2px}
.risk-bars{display:grid;gap:10px}.risk-bar-row{display:grid;grid-template-columns:minmax(120px,1fr) 2fr 46px;gap:10px;align-items:center}.risk-bar-row label{font-size:12px;font-weight:700;color:#34475c}.risk-bar-track{height:10px;border-radius:999px;background:#edf1f5;overflow:hidden}.risk-bar-fill{height:100%;border-radius:999px;background:#c89a38}.risk-bar-row output{font-size:12px;font-weight:800;color:#10223a;text-align:right}
.risk-top-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}.risk-top-card{border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff}.risk-top-card h4{margin:0 0 8px;color:#10223a}.risk-top-card ol,.risk-top-card ul{margin:0;padding-left:20px}.risk-source-tag{display:inline-flex;margin-top:5px;padding:2px 7px;border-radius:999px;background:#eef3f8;font-size:10px;font-weight:700;color:#53657a}
@media(max-width:760px){.risk-profile-overview{grid-template-columns:1fr}.risk-top-grid{grid-template-columns:1fr}.risk-bar-row{grid-template-columns:110px 1fr 42px}.custom-risk-item{flex-direction:column}.custom-risk-item .btn{align-self:flex-end}}
</style></head><body><main class="sheet"><header class="print-head"><div class="brand">${escapeHtml(activeProfile.display_name||'Pengguna LexiCore')} • LexiCore</div><h1>${escapeHtml(title)}</h1>${meta.length?`<div class="meta">${meta.map(escapeHtml).join(' &nbsp;•&nbsp; ')}</div>`:''}</header><section class="doc">${escapeHtml(content)}</section><footer class="verify">Dokumen kerja LexiCore • ${escapeHtml(activeProfile.display_name||'Pengguna LexiCore')} • wajib diverifikasi lawyer sebelum digunakan atau ditandatangani.</footer></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180));<\/script></body></html>`);
  w.document.close();
  w.focus();
}
async function exportCaseAnalysis(format){
  if(!currentCaseAnalysis)return toast('Jalankan Case Analysis terlebih dahulu');
  const fmt=String(format||'').toLowerCase();
  const caseId=Number(currentCaseAnalysis.case_analysis_id||currentCaseAnalysis.id||0);
  if(!Number.isInteger(caseId)||caseId<=0)return toast('ID Case Analysis tidak tersedia. Buka ulang hasil dari Riwayat Case lalu coba export kembali.');
  return withBusy(`Mengekspor analisis ke ${fmt.toUpperCase()}`,async()=>{
    try{
      const r=await fetch(API+'/case-analysis/export/'+fmt+'/'+encodeURIComponent(String(caseId)),{method:'GET',cache:'no-store'});
      if(!r.ok){
        let msg='Export gagal';
        const raw=await r.text().catch(()=> '');
        if(raw){
          try{const e=JSON.parse(raw);msg=e?.error||e?.message||msg}catch(_){msg=raw.slice(0,500)||msg}
        }
        throw new Error(msg);
      }
      const contentType=(r.headers.get('content-type')||'').toLowerCase();
      const expectedType=fmt==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if(!contentType.includes(expectedType)){
        const raw=await r.text().catch(()=> '');
        let msg=`Server tidak mengembalikan ${fmt.toUpperCase()} yang valid`;
        if(raw){try{const e=JSON.parse(raw);msg=e?.error||e?.message||msg}catch(_){msg=raw.slice(0,500)||msg}}
        throw new Error(msg);
      }
      const blob=await r.blob();
      const cd=r.headers.get('content-disposition')||'';
      let filename=`LexiCore-Case-Analysis.${fmt}`;
      const m=cd.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i); if(m)filename=decodeURIComponent(m[1].replace(/\"/g,''));
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
      await refreshCaseAnalysisAfterExport(fmt);
      toast(`Hasil analisis berhasil diekspor ke ${fmt.toUpperCase()} • riwayat Case Analysis diperbarui`);
    }catch(e){toast(e.message)}
  })
}


async function refreshCaseAnalysisAfterExport(fmt){
  await loadAll();
  if(currentCaseAnalysis){
    renderCaseReadiness(currentCaseAnalysis.analysis_readiness||currentCaseAnalysis.case_readiness);
    renderCaseWorkingPaper(currentCaseAnalysis);
    const id=currentCaseAnalysis.case_analysis_id||currentCaseAnalysis.id||'';
    const suffix=id?` • Riwayat #${escapeHtml(id)}`:' • Riwayat diperbarui';
    caseMeta.innerHTML=(caseMeta.innerHTML||'')+`<span class="case-export-refresh-note"> • Export ${escapeHtml(String(fmt||'').toUpperCase())} selesai${suffix}</span>`;
  }
  const card=document.getElementById('caseHistory');
  if(card){card.classList.remove('history-refreshed');void card.offsetWidth;card.classList.add('history-refreshed');}
}

// ---------------------------------------------------------------------
// Living Lifecycle: Case Analysis (4) -> Legal Draft (2) / Compliance & Risk (6)
// ---------------------------------------------------------------------
function currentCaseId(){return Number(currentCaseAnalysis?.case_analysis_id||currentCaseAnalysis?.id||0)}

async function generateDraftFromCase(){
  const caseId=currentCaseId();
  if(!caseId)return toast('Jalankan atau buka Case Analysis terlebih dahulu');
  return withBusy('Menyusun Legal Draft dari Case Analysis',async()=>{
    try{
      const d=await json(API+'/case-analysis/'+caseId+'/generate-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
      activatePanel('draft');
      await selectDraftTemplateFromRecord(d.draft);
      currentDraftId=d.draft_id;
      party1.value=d.draft.party1||'';party2.value=d.draft.party2||'';prompt.value=d.draft.prompt||'';
      draftPreview.textContent=d.content||'';
      toast(`Legal Draft disusun dari Case Analysis #${caseId} — sudah tersimpan di Menu 2`);
      await loadAll();
    }catch(e){toast(e.message)}
  })
}

async function sendCaseToCompliance(){
  const caseId=currentCaseId();
  if(!caseId)return toast('Jalankan atau buka Case Analysis terlebih dahulu');
  return withBusy('Menyusun Compliance & Risk dari Case Analysis',async()=>{
    try{
      const d=await json(API+'/case-analysis/'+caseId+'/generate-compliance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
      activatePanel('risk');
      riskEntity.value=d.data.entity||'';riskCategory.value=[...riskCategory.options].some(o=>o.value===d.data.category)?d.data.category:riskCategory.value;
      riskResult.innerHTML=renderRiskProfileDashboard(d.data);
      toast(`Compliance & Risk disusun dari Case Analysis #${caseId} — sudah tersimpan di Menu 6`);
      await loadAll();
    }catch(e){toast(e.message)}
  })
}

function caseRelatedItemRow(kind,label,icon,items,fmt){
  if(!items||!items.length)return '';
  return `<div class="case-related-group"><b>${icon} ${escapeHtml(label)} (${items.length})</b><div class="case-related-items">${items.map(fmt).join('')}</div></div>`;
}
async function renderCaseRelatedRecords(caseId){
  if(!caseId){caseRelatedRecords.innerHTML='';return}
  try{
    const d=await json(API+'/case-analysis/'+caseId+'/related');
    const r=d.data||{};
    const rows=[
      caseRelatedItemRow('drafts','Legal Draft','📄',r.drafts,x=>`<button class="btn xs soft" onclick="reviewHistory('drafts',${x.id})">${escapeHtml(x.title)}</button>`),
      caseRelatedItemRow('contract_reviews','Contract Review','📑',r.contract_reviews,x=>`<button class="btn xs soft" onclick="reviewHistory('contract_reviews',${x.id})">${escapeHtml(x.title||x.filename)}</button>`),
      caseRelatedItemRow('compliance_assessments','Compliance &amp; Risk','⚖️',r.compliance_assessments,x=>`<button class="btn xs soft" onclick="reviewHistory('risk_assessments',${x.id})">${escapeHtml(x.title||x.entity)}</button>`),
      caseRelatedItemRow('research_notes','Research Note','🔎',r.research_notes,x=>`<button class="btn xs soft" onclick="reviewHistory('research_notes',${x.id})">${escapeHtml(x.title)}</button>`),
      caseRelatedItemRow('client_communications','Dokumen Klien','👤',r.client_communications,x=>`<button class="btn xs soft" onclick="reviewHistory('client_documents',${x.id})">${escapeHtml(x.subject)}</button>`),
    ].filter(Boolean).join('');
    caseRelatedRecords.innerHTML=rows?`<div class="card" style="margin-top:12px"><h3>Dokumen &amp; Aktivitas Terkait (Living Lifecycle)</h3>${rows}</div>`:'';
  }catch(e){caseRelatedRecords.innerHTML=''}
}

async function refreshClientIdOptions(){
  try{
    const d=await json(API+'/clients');
    const box=document.getElementById('caseClientIdOptions');
    if(box)box.innerHTML=(d.data||[]).map(c=>`<option value="${escapeHtml(c.client_id)}">${escapeHtml(c.client_name||c.client_id)}</option>`).join('');
  }catch(_){}
}

// Client (1) -> pull a linked Case Analysis' (4) generated documents on request —
// this is what lets an intake worker fulfil "klien meminta dokumen kasus" without
// leaving the Client panel or re-typing anything already produced elsewhere.
async function loadClientCaseDocuments(){
  const box=document.getElementById('clientCaseRelatedDocs');
  const caseId=cCaseId.value;
  if(!caseId){box.innerHTML='';return}
  box.innerHTML='<div class="result">Memuat dokumen kasus...</div>';
  try{
    const d=await json(API+'/case-analysis/'+caseId+'/related');
    const r=d.data||{};
    if(r.case_analysis){
      cMatter.value=cMatter.value||r.case_analysis.title||'';
      if(!cClientId.value&&r.case_analysis.client_id)cClientId.value=r.case_analysis.client_id;
      if(!cName.value&&r.case_analysis.client_name)cName.value=r.case_analysis.client_name;
    }
    const rows=[
      caseRelatedItemRow('drafts','Legal Draft','📄',r.drafts,x=>`<button class="btn xs soft" type="button" onclick="reviewHistory('drafts',${x.id})">${escapeHtml(x.title)}</button>`),
      caseRelatedItemRow('contract_reviews','Contract Review','📑',r.contract_reviews,x=>`<button class="btn xs soft" type="button" onclick="reviewHistory('contract_reviews',${x.id})">${escapeHtml(x.title||x.filename)}</button>`),
      caseRelatedItemRow('compliance_assessments','Compliance &amp; Risk','⚖️',r.compliance_assessments,x=>`<button class="btn xs soft" type="button" onclick="reviewHistory('risk_assessments',${x.id})">${escapeHtml(x.title||x.entity)}</button>`),
      caseRelatedItemRow('research_notes','Research Note','🔎',r.research_notes,x=>`<button class="btn xs soft" type="button" onclick="reviewHistory('research_notes',${x.id})">${escapeHtml(x.title)}</button>`),
    ].filter(Boolean).join('');
    box.innerHTML=rows?`<div class="card" style="margin-top:12px"><h3>Dokumen Kasus #${escapeHtml(caseId)} Tersedia untuk Diminta</h3>${rows}</div>`:'<div class="result">Belum ada dokumen tersimpan untuk Case Analysis ini.</div>';
  }catch(e){box.innerHTML=`<div class="result">${escapeHtml(e.message)}</div>`}
}

function focusCaseInput(){
  const f=caseFile&&caseFile.files&&caseFile.files[0];
  if(f){caseFile.focus();return;}
  caseNarrative.focus();
}
function setCaseUploadStatus(state){
  const el=document.getElementById('caseUploadStatus'); if(!el)return;
  const f=caseFile&&caseFile.files&&caseFile.files[0];
  el.classList.remove('ready','uploaded');
  if(!f){el.textContent='';return;}
  if(state==='uploaded'){el.textContent='✓ Upload sukses · '+f.name;el.classList.add('uploaded');}
  else{el.textContent='✓ File berhasil dipilih · '+f.name;el.classList.add('ready');}
}
function advanceCaseFlow(){
  const f=caseFile&&caseFile.files&&caseFile.files[0], narrative=(caseNarrative&&caseNarrative.value||'').trim();
  if(!f && !narrative){focusCaseInput();toast('Isi narasi manual atau pilih file terlebih dahulu.');return;}
  const modeField=caseRegulatoryMode&&caseRegulatoryMode.closest('.field');
  if(modeField)modeField.scrollIntoView({behavior:'smooth',block:'center'});
  if(caseRegulatoryMode)caseRegulatoryMode.focus();
}
function syncCaseProcessStrip(){
  const strip=document.getElementById('caseProcessStrip'); if(!strip)return;
  const inputChip=strip.querySelector('[data-case-step="input"]'), modeChip=strip.querySelector('[data-case-step="mode"]'), analysisChip=strip.querySelector('[data-case-step="analysis"]');
  const label=document.getElementById('caseProcessInputLabel'), modeLabel=document.getElementById('caseProcessModeLabel');
  const next=document.getElementById('caseNextChip'), manualStatus=document.getElementById('caseManualStatus');
  const f=caseFile&&caseFile.files&&caseFile.files[0], narrative=(caseNarrative&&caseNarrative.value||'').trim();
  setCaseUploadStatus(caseFileUploadStored?'uploaded':'ready');
  if(next){next.disabled=!(f||narrative);next.classList.toggle('ready',Boolean(f||narrative));next.textContent=(f?'NEXT · Mode & Analisis →':(narrative?'PROSES · Mode & Analisis →':'NEXT · Mode & Analisis →'));}
  if(manualStatus)manualStatus.textContent=f?'File siap diproses. Pilih mode lalu jalankan analisis.':(narrative?'Input manual siap. Pilih mode lalu jalankan analisis.':'Isi narasi manual atau pilih file untuk melanjutkan.');
  if(f){label.textContent='File: '+f.name; inputChip.classList.add('ready'); inputChip.classList.remove('active');}
  else if(narrative){label.textContent='Input manual'; inputChip.classList.add('ready'); inputChip.classList.remove('active');}
  else{label.textContent='Input manual / pilih file'; inputChip.classList.add('active'); inputChip.classList.remove('ready');}
  const mode=(caseRegulatoryMode&&caseRegulatoryMode.value||'hybrid');
  modeLabel.textContent='Mode '+({offline:'Lokal',hybrid:'Hybrid',online:'Online'}[mode]||mode);
  const modeHint=document.getElementById('caseModeHint');
  if(modeHint)modeHint.textContent=mode==='offline'?'Lokal: hanya corpus regulasi lokal; tidak ada koneksi sumber resmi online.':mode==='online'?'Online: corpus lokal hanya menjadi indeks pencarian; dasar hukum kandidat hanya ditampilkan bila sumber resmi berhasil dijangkau.':'Hybrid: kandidat dari corpus lokal diperiksa terhadap sumber resmi online bila tersedia.';
  const manualField=document.getElementById('caseManualAuthorityField');
  const manualHint=document.getElementById('caseManualAuthorityHint');
  if(manualField)manualField.style.display=mode==='offline'?'none':'';
  if(manualHint)manualHint.textContent=mode==='online'
    ? 'Online tetap mencari dan scraping metadata sumber resmi secara otomatis. Referensi opsional di atas diverifikasi online dan diprioritaskan untuk disinkronkan dengan perkara.'
    : 'Hybrid tetap menelusuri corpus lokal dan sumber resmi online secara otomatis. Referensi opsional di atas diverifikasi online dan diprioritaskan untuk disinkronkan dengan perkara.';
  modeChip.classList.toggle('ready',Boolean(f||narrative));
  modeChip.classList.toggle('active',Boolean(f||narrative)&&!caseAnalysisInFlight&&!currentCaseAnalysis);
  analysisChip.classList.toggle('active',caseAnalysisInFlight);
  analysisChip.classList.toggle('ready',Boolean(currentCaseAnalysis)&&!caseAnalysisInFlight);
}

const WORKSPACE_EXPORTS={
  review:{title:'Contract Review & Analysis',root:'reviewResult',empty:['Belum ada analisis.']},
  corpus:{title:'Regulatory Corpus — Regulatory Intelligence',root:'corpusResult',empty:['Belum ada pencarian corpus.']},
  research:{title:'Legal Research & Case Summary',root:'researchResult',empty:['Belum ada research note.']},
  risk:{title:'Compliance & Risk Assessment — Risk Profile',root:'riskResult',empty:['Jawab kontrol pada bagian sebelumnya.']},
  norm:{title:'Norm Conflict — Conflict Working Paper',root:'normResult',empty:['Belum ada analisis konflik norma.']},
  client:{title:'Client Communication & Legal Document',root:null,empty:[]}
};
function workspaceExportNode(kind){
  if(kind==='client'){
    const wrap=document.createElement('div');
    const subject=(cSubject.value||'').trim(),message=(cMessage.value||'').trim();
    if(subject){const h=document.createElement('h2');h.textContent=subject;wrap.appendChild(h)}
    if(message){const p=document.createElement('div');p.style.whiteSpace='pre-wrap';p.textContent=message;wrap.appendChild(p)}
    return wrap;
  }
  const cfg=WORKSPACE_EXPORTS[kind];return cfg&&cfg.root?document.getElementById(cfg.root):null;
}
function workspaceHasContent(kind,node){
  const cfg=WORKSPACE_EXPORTS[kind];if(!cfg||!node)return false;
  const text=(node.innerText||node.textContent||'').trim();if(!text)return false;
  if(kind==='client')return !!((cSubject.value||'').trim()||(cMessage.value||'').trim());
  return !(cfg.empty||[]).some(x=>text.startsWith(x));
}
function collectWorkspaceBlocks(node){
  const clone=node.cloneNode(true);clone.querySelectorAll('button,input,select,textarea,.export-actions').forEach(x=>x.remove());
  const blocks=[];
  clone.querySelectorAll('h1,h2,h3,h4').forEach(h=>{const text=(h.innerText||'').trim();if(text)blocks.push({type:'heading',level:Number(h.tagName.slice(1))||2,text})});
  clone.querySelectorAll('table').forEach(t=>{const rows=[...t.rows].map(r=>[...r.cells].map(c=>(c.innerText||'').trim()));if(rows.length)blocks.push({type:'table',rows})});
  clone.querySelectorAll('ul,ol').forEach(l=>{const items=[...l.children].filter(x=>x.tagName==='LI').map(x=>(x.innerText||'').trim()).filter(Boolean);if(items.length)blocks.push({type:'list',items})});
  clone.querySelectorAll('p').forEach(p=>{const text=(p.innerText||'').trim();if(text)blocks.push({type:'paragraph',text})});
  if(!blocks.length){const text=(clone.innerText||clone.textContent||'').trim();if(text)blocks.push({type:'paragraph',text})}
  return blocks;
}
function exportWorkspacePdf(kind){
  const cfg=WORKSPACE_EXPORTS[kind],node=workspaceExportNode(kind);if(!workspaceHasContent(kind,node))return toast('Belum ada hasil yang dapat diekspor');
  const title=cfg.title+(kind==='risk'&&riskEntity.value.trim()?` — ${riskEntity.value.trim()}`:'');
  const clone=node.cloneNode(true);clone.querySelectorAll('button,.export-actions').forEach(x=>x.remove());
  const w=window.open('','_blank','width=1000,height=760');if(!w)return toast('Popup diblokir browser. Izinkan popup untuk Export PDF.');
  w.document.open();w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;color:#172235;background:#fff;font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.5}main{max-width:180mm;margin:auto}header{border-bottom:2px solid #c89a38;padding-bottom:7mm;margin-bottom:8mm}.brand{font-size:9pt;color:#6b7280}.brand b{font-family:Georgia,serif;color:#0a1128;font-size:14pt}.brand em{font-style:normal;color:#a87920;margin-left:4px}h1{font-family:Georgia,serif;color:#0a1128;font-size:18pt;margin:3mm 0 0}h2,h3,h4{font-family:Georgia,serif;color:#10223a;break-after:avoid}table{width:100%;border-collapse:collapse;margin:5mm 0;font-size:9pt}th,td{border:1px solid #dbe2ea;padding:6px;vertical-align:top}th{background:#f3f6f9;text-align:left}.preview{white-space:normal}.risk-score-gauge{display:none}.risk-bar-track{height:8px;background:#edf1f5}.risk-bar-fill{height:8px;background:#c89a38}.badge{display:inline-block;border:1px solid #dbe2ea;border-radius:10px;padding:2px 6px;margin:2px}.verify{margin-top:10mm;padding-top:4mm;border-top:1px solid #ddd;color:#777;font-size:8pt}@media print{a{color:#111;text-decoration:none}}
  </style></head><body><main><header><div class="brand"><b>LexiCore</b><em>Assistant</em> · ${escapeHtml(activeProfile.display_name||'Pengguna LexiCore')}</div><h1>${escapeHtml(title)}</h1></header><section>${clone.innerHTML}</section><footer class="verify">Working document — professional verification required before legal use.</footer></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180));<\/script></body></html>`);w.document.close();w.focus();
}
async function exportWorkspaceDocx(kind){
  const cfg=WORKSPACE_EXPORTS[kind],node=workspaceExportNode(kind);if(!workspaceHasContent(kind,node))return toast('Belum ada hasil yang dapat diekspor');
  const title=cfg.title+(kind==='risk'&&riskEntity.value.trim()?` — ${riskEntity.value.trim()}`:'');
  const subtitle=kind==='client'?[(cName.value||'').trim(),(cMatter.value||'').trim()].filter(Boolean).join(' • '):'';
  const blocks=collectWorkspaceBlocks(node);
  return withBusy('Mengekspor DOCX',async()=>{try{const r=await fetch(API+'/export/document/docx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,subtitle,blocks})});if(!r.ok){const raw=await r.text();let msg=raw||'Export gagal';try{const e=JSON.parse(raw);msg=e.error||e.message||msg}catch(_){}throw new Error(msg)}const ct=(r.headers.get('content-type')||'').toLowerCase();if(!ct.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')){const raw=await r.text();throw new Error('Server tidak mengembalikan DOCX valid. '+raw.slice(0,240))}const blob=await r.blob(),cd=r.headers.get('content-disposition')||'';let filename='LexiCore-Working-Paper.docx';const m=cd.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);if(m)filename=decodeURIComponent(m[1].replace(/\"/g,''));const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);toast('DOCX berhasil diekspor')}catch(e){toast(e.message)}})
}

function formatContractReview(x){
  const rows=x.clause_evaluations||[];
  const head=`<div class="contract-review-head"><b>${escapeHtml(x.filename||'-')} • ${(x.contract_type||'KONTRAK_UMUM').replaceAll('_',' ')}</b><span>Risk: ${escapeHtml(x.risk_score||'-')} • Pihak: ${escapeHtml((x.parties||[]).join(', ')||'-')} • ${escapeHtml(x.effective_date||'-')} s.d. ${escapeHtml(x.termination_date||'-')}</span></div>`;
  if(!rows.length){return head+`<div>${escapeHtml(x.summary||'Tidak ada pasal yang dapat diekstrak untuk evaluasi tabel.')}</div>`}
  const body=rows.map((r,i)=>`<tr><td><span class="article-tag">${escapeHtml(r.article_number==='USULAN'?'KLAUSUL USULAN':'Pasal '+(r.article_number||i+1))}</span><div>${escapeHtml(r.existing_clause||'-').replaceAll('\n','<br>')}</div></td><td>${escapeHtml(r.risk_loophole||'-')}</td><td><div class="copy-ready">${escapeHtml(r.recommended_redraft||'-').replaceAll('\n','<br>')}</div></td></tr>`).join('');
  return head+`<div class="contract-review-table-wrap"><table class="contract-review-table"><thead><tr><th>Pasal Eksisting</th><th>Potensi Risiko / Loophole</th><th>Rekomendasi Redaksional Baru</th></tr></thead><tbody>${body}</tbody></table></div><div class="contract-review-note">Rekomendasi redaksional adalah usulan drafting siap-edit berdasarkan bunyi kontrak yang diunggah. Keabsahan, keberlakuan, forum, dan akibat hukum tetap harus diverifikasi terhadap fakta transaksi dan hukum positif yang relevan.</div>`;
}
async function reviewContract(){return withBusy('Menganalisis kontrak',async()=>{let f=contractFile.files[0];if(!f)return toast('Pilih file kontrak');let fd=new FormData();fd.append('file',f);reviewResult.textContent='Menganalisis...';try{let d=await json(API+'/review',{method:'POST',body:fd}),x=d.data;reviewResult.innerHTML=formatContractReview(x);toast('Review selesai');loadAll()}catch(e){reviewResult.textContent=e.message;toast(e.message)}})}
const coreSourcePresets={
  kuhp_2023:{title:'Kitab Undang-Undang Hukum Pidana (KUHP Nasional)',citation:'UU No. 1 Tahun 2023 sebagaimana disesuaikan/diubah dengan UU No. 1 Tahun 2026',hint:'KUHP Nasional berlaku sejak 2 Januari 2026. Untuk riset pasal, verifikasi pula perubahan/penyesuaian dalam UU No. 1 Tahun 2026 dan putusan pengujian yang relevan.'},
  penyesuaian_pidana_2026:{title:'Penyesuaian Pidana',citation:'UU No. 1 Tahun 2026 tentang Penyesuaian Pidana',hint:'Instrumen penyesuaian pidana yang berlaku sejak 2 Januari 2026 dan berkaitan langsung dengan implementasi KUHP Nasional.'},
  kuhperdata_bw:{title:'Kitab Undang-Undang Hukum Perdata (KUHPerdata / Burgerlijk Wetboek)',citation:'Burgerlijk Wetboek voor Indonesie (Staatsblad 1847:23)',hint:'Gunakan dengan pemeriksaan status pasal secara spesifik karena sebagian materi KUHPerdata telah dicabut, diubah, atau digantikan oleh undang-undang sektoral.'}
};
function applyCoreSourcePreset(){const p=coreSourcePresets[rType.value];if(!p){sourceStatusHint.textContent='';return;}if(!rTitle.value.trim())rTitle.value=p.title;if(!rCitation.value.trim())rCitation.value=p.citation;sourceStatusHint.textContent=p.hint;}

async function searchResearchAuthorities(){
 const q=(rQuery.value||rCitation.value||rTitle.value||'').trim();if(q.length<3)return toast('Masukkan query riset');
 return withBusy('Menelusuri doktrin & yurisprudensi',async()=>{try{const d=await json(API+'/research/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,mode:rMode.value,focus:rFocus.value,limit:12})});const x=d.data||{},local=x.local_results||[],online=x.online_results||[];let out=`FOKUS: ${(x.research_focus||'mixed').toUpperCase()} | MODE: ${(x.mode||'').toUpperCase()}\nLOCAL: ${local.length} | ONLINE: ${online.length}\n\n`;if(x.research_note)out+=`${x.research_note}\n\n`;local.forEach((r,i)=>out+=`${i+1}. [LOCAL] ${r.title}\nStatus: ${r.status||'-'} | ${r.verification_status||''}\n${r.official_url||''}\n\n`);online.forEach((r,i)=>out+=`${i+1}. [OFFICIAL] ${r.title}\n${r.source_name||''}\n${r.url||''}\n\n`);researchResult.textContent=out||'Tidak ada hasil';toast('Penelusuran selesai')}catch(e){toast(e.message)}})}
function renderResearchSummary(x){
 const p=x.research_payload||{};
 if(['putusan_ma','putusan_mk','putusan_pengadilan','case'].includes(x.source_type)){
   return `TIPE SUMBER\n${x.source_label||x.source_type}\n\n1. KRONOLOGI KASUS\n${p.chronology||x.issue||'-'}\n\n2. PERTIMBANGAN HUKUM HAKIM (RATIO DECIDENDI)\n${p.ratio_decidendi||x.reasoning||'-'}\n\n3. AMAR PUTUSAN\n${p.disposition||x.holding||'-'}\n\n4. KAIDAH HUKUM\n${p.legal_rule||'-'}\nStatus Kaidah: ${p.legal_rule_status||'UNVERIFIED'}\n\nPROFESSIONAL VERIFICATION: ${p.professional_verification||'PENDING'}\n\nKEYWORDS\n${(x.keywords||[]).join(', ')}`;
 }
 if(['doctrine','legal_opinion','memo'].includes(x.source_type)){
   return `TIPE SUMBER\n${x.source_label||x.source_type}\n\nTOPIK / ISU DOKTRIN\n${p.doctrine_topic||x.issue||'-'}\n\nPOKOK PENDAPAT / TESIS\n${p.doctrine_thesis||x.holding||'-'}\n\nARGUMENTASI / ANALISIS\n${p.doctrine_analysis||x.reasoning||'-'}\n\nIMPLIKASI PRAKTIS\n${p.doctrine_implication||'-'}\n\nPROFESSIONAL VERIFICATION: ${p.professional_verification||'PENDING'}\n\nKEYWORDS\n${(x.keywords||[]).join(', ')}`;
 }
 return `TIPE SUMBER\n${x.source_label||x.source_type}\n\n${x.issue_label||'ISSUE'}\n${x.issue}\n\n${x.result_label||'HASIL / NORMA'}\n${x.holding}\n\n${x.reasoning_label||'ANALISIS / REASONING'}\n${x.reasoning}\n\nKEYWORDS\n${(x.keywords||[]).join(', ')}`;
}
async function summarizeResearch(){return withBusy('Menyusun legal research note',async()=>{try{let d=await json(API+'/research/summarize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:rTitle.value,jurisdiction:rJur.value,citation:rCitation.value,source_type:rType.value,source_text:rText.value})}),x=d.data;researchResult.textContent=renderResearchSummary(x);toast('Research note tersimpan');loadAll()}catch(e){toast(e.message)}})}
const RISK_CUSTOM_STORAGE='lexicore.customRiskControls.v1';
function allCustomRiskControls(){try{return JSON.parse(localStorage.getItem(RISK_CUSTOM_STORAGE)||'{}')||{}}catch(_){return {}}}
function customRiskControls(category=riskCategory.value){const all=allCustomRiskControls();return Array.isArray(all[category])?all[category]:[]}
function saveCustomRiskControls(category,rows){const all=allCustomRiskControls();all[category]=rows;localStorage.setItem(RISK_CUSTOM_STORAGE,JSON.stringify(all));}
function customRiskKey(){return 'custom_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
function customRiskOptionDefaultRows(){return [
 {label:'Sudah optimal / sesuai kebutuhan',risk_level:'LOW'},
 {label:'Sebagian / perlu perbaikan',risk_level:'MEDIUM'},
 {label:'Belum tersedia / kondisi berisiko',risk_level:'HIGH'}
]}
function renderCustomRiskOptionEditor(rows){const box=document.getElementById('customRiskOptions');if(!box)return;const opts=(rows&&rows.length?rows:customRiskOptionDefaultRows());box.innerHTML=opts.map((o,i)=>`<div class="custom-risk-option-row" data-custom-option-row><input data-custom-option-label value="${escapeHtml(o.label||'')}" placeholder="Opsi jawaban ${i+1}"><select data-custom-option-risk><option value="LOW" ${o.risk_level==='LOW'?'selected':''}>Low Risk</option><option value="MEDIUM" ${o.risk_level==='MEDIUM'?'selected':''}>Medium Risk</option><option value="HIGH" ${o.risk_level==='HIGH'?'selected':''}>High Risk</option><option value="NA" ${o.risk_level==='NA'?'selected':''}>N/A — tidak dinilai</option></select><button class="btn xs danger-outline custom-risk-option-remove" type="button" onclick="removeCustomRiskOptionRow(this)" aria-label="Hapus opsi">×</button></div>`).join('')}
function addCustomRiskOptionRow(){const box=document.getElementById('customRiskOptions');if(!box)return;if(box.querySelectorAll('[data-custom-option-row]').length>=8){toast('Maksimal 8 opsi jawaban');return;}const i=box.querySelectorAll('[data-custom-option-row]').length;box.insertAdjacentHTML('beforeend',`<div class="custom-risk-option-row" data-custom-option-row><input data-custom-option-label placeholder="Opsi jawaban ${i+1}"><select data-custom-option-risk><option value="LOW">Low Risk</option><option value="MEDIUM" selected>Medium Risk</option><option value="HIGH">High Risk</option><option value="NA">N/A — tidak dinilai</option></select><button class="btn xs danger-outline custom-risk-option-remove" type="button" onclick="removeCustomRiskOptionRow(this)" aria-label="Hapus opsi">×</button></div>`)}
function removeCustomRiskOptionRow(btn){const box=document.getElementById('customRiskOptions');if(!box)return;if(box.querySelectorAll('[data-custom-option-row]').length<=2){toast('Minimal 2 opsi jawaban diperlukan');return;}btn.closest('[data-custom-option-row]')?.remove()}
function collectCustomRiskOptions(){return [...document.querySelectorAll('#customRiskOptions [data-custom-option-row]')].map((row,i)=>({value:'opt_'+(i+1),label:(row.querySelector('[data-custom-option-label]')?.value||'').trim(),risk_level:row.querySelector('[data-custom-option-risk]')?.value||'MEDIUM'})).filter(o=>o.label)}
function renderCustomRiskList(){const rows=customRiskControls();const box=document.getElementById('customRiskList'), count=document.getElementById('customRiskCount'), active=document.getElementById('customRiskActiveCategory');if(active)active.textContent=riskCategory.value;if(count)count.textContent=rows.length+' tambahan';if(!box)return;box.innerHTML=rows.length?rows.map((r,i)=>`<div class="custom-risk-item"><div><b>${escapeHtml(r.question)}</b><small>${escapeHtml(r.group||'Kontrol Tambahan')} • Materialitas ${escapeHtml(r.severity||'MEDIUM')}</small><div class="custom-risk-option-summary">${(r.options||[]).map(o=>`${escapeHtml(o.label)} → ${escapeHtml(o.risk_level||'MEDIUM')}`).join(' • ')}</div><span class="risk-source-tag">USER DEFINED</span></div><button class="btn xs danger-outline" type="button" onclick="removeCustomRiskControl(${i})">Hapus</button></div>`).join(''):'<div class="result">Belum ada pertanyaan tambahan untuk kategori ini.</div>'}
function addCustomRiskControl(){const q=(customRiskQuestion.value||'').trim();if(!q){toast('Pertanyaan tambahan belum diisi');return;}const options=collectCustomRiskOptions();if(options.length<2){toast('Isi minimal 2 opsi jawaban yang relevan');return;}const row={key:customRiskKey(),group:(customRiskGroup.value||'Kontrol Tambahan').trim(),question:q,severity:customRiskSeverity.value||'MEDIUM',options,risk:(customRiskRisk.value||'Potensi ketidakpatuhan pada kontrol tambahan yang ditetapkan pengguna.').trim(),basis:(customRiskBasis.value||'').trim(),sanctions:(customRiskSanctions.value||'').trim(),actions:(customRiskActions.value||'').split('\n').map(x=>x.trim()).filter(Boolean)};const rows=customRiskControls();rows.push(row);saveCustomRiskControls(riskCategory.value,rows);['customRiskGroup','customRiskQuestion','customRiskRisk','customRiskBasis','customRiskSanctions','customRiskActions'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});customRiskSeverity.value='MEDIUM';renderCustomRiskOptionEditor();renderCustomRiskList();loadRiskQuestions();toast('Pertanyaan dan opsi jawaban ditambahkan ke '+riskCategory.value)}
function removeCustomRiskControl(index){const rows=customRiskControls();rows.splice(index,1);saveCustomRiskControls(riskCategory.value,rows);renderCustomRiskList();loadRiskQuestions();toast('Pertanyaan tambahan dihapus')}
function riskOptions(q){return (q.options&&q.options.length?q.options:[{value:'yes',label:'Ya / tersedia'},{value:'partial',label:'Sebagian / perlu perbaikan'},{value:'no',label:'Tidak / belum tersedia'},{value:'na',label:'N/A — tidak relevan'}])}
function collectRiskAnswers(){let answers={};document.querySelectorAll('[data-risk]').forEach(x=>answers[x.dataset.risk]=x.value);return answers}
let riskPreviewTimer=null;
function scheduleRiskPreview(){clearTimeout(riskPreviewTimer);riskPreviewTimer=setTimeout(()=>previewRiskProfile(),220)}
async function loadRiskQuestions(){try{const d=await json(API+'/compliance/questions?category='+encodeURIComponent(riskCategory.value));const system=d.data?.questions||[];const custom=customRiskControls().map(r=>({...r,custom:true}));const qs=[...system,...custom];const groups=[];const byGroup={};qs.forEach(q=>{const g=q.group||'Assessment';if(!byGroup[g]){byGroup[g]=[];groups.push(g)}byGroup[g].push(q)});questions.innerHTML=groups.map(g=>`<div class="risk-question-group"><h3>${escapeHtml(g)} <span class="risk-question-count">${byGroup[g].length} indikator</span></h3>${byGroup[g].map(q=>`<div class="field"><label>${escapeHtml(q.question)}${q.custom?' <span class="risk-source-tag">USER</span>':''}</label><select data-risk="${escapeHtml(q.key)}" onchange="scheduleRiskPreview()">${riskOptions(q).map(o=>`<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select></div>`).join('')}</div>`).join('');renderCustomRiskList();scheduleRiskPreview()}catch(e){questions.innerHTML='<div class="result">Gagal memuat pertanyaan compliance.</div>'}}
function riskGroupStats(rows){const numeric={LOW:15,MEDIUM:50,HIGH:85};const groups={};rows.filter(r=>r.control_status!=='NA'&&r.control_status!=='UNANSWERED').forEach(r=>{const g=r.control_group||'Assessment';(groups[g]||(groups[g]=[])).push(numeric[r.risk_level]??50)});return Object.entries(groups).map(([name,vals])=>({name,score:Math.round(vals.reduce((a,b)=>a+b,0)/Math.max(vals.length,1))}))}
function renderRiskProfileDashboard(x){const rows=x.risk_matrix||[];if(!rows.length)return '<div class="result">Belum ada matriks risiko.</div>';const groups=riskGroupStats(rows);const high=rows.filter(r=>r.risk_level==='HIGH'&&r.control_status!=='NA'&&r.control_status!=='UNANSWERED').slice(0,5);const mitig=[];rows.filter(r=>r.risk_level!=='LOW'&&r.control_status!=='NA'&&r.control_status!=='UNANSWERED').forEach(r=>(r.mitigation_checklist||[]).forEach(a=>{if(a&&!mitig.includes(a))mitig.push(a)}));const overview=`<div class="risk-profile-overview"><div class="risk-score-gauge" style="--risk:${Number(x.score||0)}"><div class="inner"><strong>${x.score??0}%</strong><span>${escapeHtml(x.risk_level||'-')} RISK</span></div></div><div class="risk-bars">${groups.map(g=>`<div class="risk-bar-row"><label>${escapeHtml(g.name)}</label><div class="risk-bar-track"><div class="risk-bar-fill" style="width:${Math.min(100,g.score)}%"></div></div><output>${g.score}%</output></div>`).join('')}</div></div>`;const top=`<div class="risk-top-grid"><div class="risk-top-card"><h4>Top Critical Risks</h4>${high.length?`<ol>${high.map(r=>`<li>${escapeHtml(r.risk_identification)}</li>`).join('')}</ol>`:'<div class="result">Tidak ada HIGH risk pada jawaban saat ini.</div>'}</div><div class="risk-top-card"><h4>Priority Mitigation</h4>${mitig.length?`<ul>${mitig.slice(0,6).map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul>`:'<div class="result">Belum ada mitigasi prioritas.</div>'}</div></div>`;return overview+top+renderRiskMatrix(x)}
function renderRiskMatrix(x){const rows=x.risk_matrix||[];if(!rows.length)return `<div class="result">Belum ada matriks risiko.</div>`;const body=rows.map(r=>`<tr><td><b>${escapeHtml(r.risk_identification||'-')}</b><div class="risk-legal-note">Jawaban: ${escapeHtml(r.answer_label||r.control_status||'-')} • Dampak: ${escapeHtml(r.control_status||'-')}</div>${r.source==='USER_DEFINED'?'<span class="risk-source-tag">USER DEFINED</span>':''}</td><td><span class="risk-level-${escapeHtml(r.risk_level||'LOW')}">${escapeHtml(r.risk_level||'-')}</span><div style="margin-top:6px">${escapeHtml(r.legal_justification||'-')}</div><div class="risk-legal-note"><b>Dasar:</b> ${escapeHtml(r.legal_basis||'-')}<br><b>Sanksi/konsekuensi:</b> ${escapeHtml(r.sanction_basis||'-')}</div></td><td><ul class="mitigation-list">${(r.mitigation_checklist||[]).map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul></td></tr>`).join('');return `<div class="risk-matrix-summary"><span class="badge">Kategori: ${escapeHtml(x.category||'-')}</span><span class="badge">Overall: ${escapeHtml(x.risk_level||'-')}</span><span class="badge">Score: ${x.score??'-'}/100</span><span class="badge">System: ${x.system_question_count??'-'} • Tambahan: ${x.custom_question_count??0}</span><span class="badge">Completion: ${x.completion_percentage??100}%${Number(x.missing_count||0)>0?' • '+Number(x.missing_count||0)+' belum dijawab':''}</span><span class="badge">Professional Verification: ${escapeHtml(x.professional_verification||'PENDING')}</span></div><div class="risk-matrix-wrap"><table class="risk-matrix-table"><thead><tr><th>Identifikasi Risiko</th><th>Tingkat Risiko & Justifikasi Hukum</th><th>Actionable Mitigation Checklist</th></tr></thead><tbody>${body}</tbody></table></div><div class="contract-review-note">Penilaian bersifat issue spotting. Pertanyaan buatan pengguna ikut memengaruhi profil risiko, tetapi dasar hukum, sanksi, tempus dan applicability tetap wajib diverifikasi sebelum dipakai sebagai legal opinion.</div>`}
async function previewRiskProfile(){const answers=collectRiskAnswers();const custom_controls=customRiskControls();try{const d=await json(API+'/compliance/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Compliance Assessment Preview',entity:riskEntity.value,category:riskCategory.value,answers,custom_controls,preview:true})});riskResult.innerHTML=renderRiskProfileDashboard(d.data)}catch(e){/* preview must never block data entry */}}
async function assessRisk(){return withBusy('Menilai compliance & risk',async()=>{const answers=collectRiskAnswers(),custom_controls=customRiskControls();try{let d=await json(API+'/compliance/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Compliance Assessment',entity:riskEntity.value,category:riskCategory.value,answers,custom_controls})}),x=d.data;riskResult.innerHTML=renderRiskProfileDashboard(x);toast('Assessment tersimpan');loadAll()}catch(e){toast(e.message)}})}

function caseTab(name,btn){
  const panes={source:caseSourcePane,evidence:caseEvidencePane,analysis:caseAnalysisPane,action:caseActionPane};
  Object.entries(panes).forEach(([k,p])=>p&&p.classList.toggle('active',k===name));
  document.querySelectorAll('.case-tab').forEach(b=>b.classList.toggle('active',b===btn));
}

function userConnectivityStatus(row){
  const code=String((row||{}).connectivity_status||'').trim().toUpperCase();
  const status=Number((row||{}).http_status||0);
  const map={
    'REACHABLE':{label:'Sumber dapat diakses',note:'Koneksi ke sumber resmi berhasil.',tone:'source-ok'},
    'AUTOMATION_BLOCKED_403':{label:'Akses otomatis dibatasi oleh situs',note:'Sumber mungkin tetap dapat diperiksa secara manual melalui situs resminya.',tone:'source-warn'},
    'SSL_VALIDATION_ERROR':{label:'Koneksi aman belum dapat diverifikasi',note:'Perlu pengecekan manual terhadap koneksi dan sertifikat situs.',tone:'source-warn'},
    'DNS_RESOLUTION_ERROR':{label:'Alamat sumber belum dapat dijangkau',note:'Nama domain tidak dapat ditemukan saat pemeriksaan.',tone:'source-warn'},
    'TIMEOUT':{label:'Sumber belum merespons tepat waktu',note:'Silakan coba lagi atau lakukan pengecekan manual.',tone:'source-warn'},
    'TIME_BUDGET_EXCEEDED':{label:'Pemeriksaan dihentikan karena batas waktu',note:'Sumber belum sempat diperiksa dalam sesi ini.',tone:'source-warn'},
    'FETCH_ERROR':{label:'Dokumen belum berhasil diambil',note:'Sumber ditemukan, tetapi dokumen belum dapat dibaca otomatis.',tone:'source-warn'},
    'NON_OFFICIAL_HOST':{label:'Bukan domain resmi yang dikenali',note:'Jangan gunakan sebagai sumber hukum final sebelum diverifikasi.',tone:'source-warn'},
    'HTTP_ERROR':{label:'Sumber belum dapat diakses',note:'Situs mengembalikan respons yang tidak dapat digunakan saat ini.',tone:'source-warn'},
    'UNREACHABLE':{label:'Sumber sedang tidak dapat dijangkau',note:'Coba kembali nanti atau lakukan pengecekan manual.',tone:'source-bad'}
  };
  if(map[code]) return map[code];
  if((row||{}).reachable || (status>=200&&status<400)) return map.REACHABLE;
  return {label:'Status sumber perlu diperiksa',note:'Belum tersedia hasil koneksi yang dapat disimpulkan.',tone:'source-warn'};
}
async function checkOfficialSources(){
  return withBusy('Memeriksa koneksi sumber resmi',async()=>{
    try{
      const d=await json(API+'/legal-sources/health');
      const rows=d.data||[];
      const auth=rows.filter(x=>x.authoritative), ok=auth.filter(x=>x.reachable);
      officialSourcesResult.style.display='block';
      officialSourcesResult.innerHTML=`<div class="result"><b>Sumber resmi dapat diakses: ${ok.length}/${auth.length}</b><br><small>Pemeriksaan ini hanya memastikan akses ke sumber. Status berlaku dan relevansi norma tetap harus diverifikasi.</small></div>`+
        (rows.length?`<div class="e2a-list">${rows.map(x=>{const st=userConnectivityStatus(x);return `<div class="e2a-item"><b>${escapeHtml(x.name||x.source_name||x.id||'-')}</b><div class="e2a-quote"><span class="${st.tone}">${escapeHtml(st.label)}</span><br><small>${escapeHtml(st.note)}</small></div></div>`}).join('')}</div>`:'');
      toast('Pemeriksaan sumber resmi selesai');
    }catch(e){officialSourcesResult.style.display='block';officialSourcesResult.innerHTML=`<div class="result">Pemeriksaan sumber resmi belum berhasil. Silakan coba kembali.</div>`;toast('Pemeriksaan sumber resmi belum berhasil')}
  });
}

function humanizeVerificationStatus(value){
  const v=String(value||'').trim().toUpperCase();
  const map={
    'PENDING':'Menunggu verifikasi profesional',
    'NOT_VERIFIED':'Belum diverifikasi',
    'VERIFIED':'Terverifikasi',
    'VERIFIED_APPLICABLE':'Terverifikasi relevan dan berlaku',
    'STATUS_UNCERTAIN':'Status hukum belum pasti',
    'PROVISION_VERIFIED':'Pasal terverifikasi',
    'CASE_NEXUS_VERIFIED':'Keterkaitan dengan perkara terverifikasi',
    'VERIFIED_NOT_RELEVANT':'Terverifikasi tidak relevan',
    'CASE_NEXUS_UNCERTAIN':'Keterkaitan dengan perkara masih perlu dipastikan',
    'NO_CASE_NEXUS':'Tidak ditemukan keterkaitan yang cukup dengan perkara',
    'TEMPUS_UNVERIFIED':'Waktu berlaku belum diverifikasi',
    'TEMPUS_VERIFIED':'Waktu berlaku terverifikasi',
    'TEMPUS_REQUIRES_EXACT_DATE':'Perlu tanggal peristiwa yang lebih pasti',
    'POST_TEMPUS_EXCLUDED':'Terbit setelah peristiwa — tidak dipakai sebagai dasar materiil',
    'POTENTIALLY_APPLICABLE':'Berpotensi relevan — masih perlu verifikasi',
    'UNVERIFIED_IDENTITY_MISMATCH':'Identitas peraturan belum cocok',
    'REJECTED_NON_LEGAL_CONTENT':'Bukan dokumen hukum yang dapat digunakan',
    'PROVISION_UNVERIFIED':'Pasal belum diverifikasi',
    'PROVISION_PARTIALLY_VERIFIED':'Pasal terverifikasi sebagian',
    'COMPLETE':'Pembacaan selesai',
    'PARTIAL':'Pembacaan sebagian',
    'UNKNOWN':'Status belum tersedia',
    'REACHABLE':'Dapat diakses',
    'UNREACHABLE':'Tidak dapat diakses',
    'REACHABLE_NO_LINKS':'Dapat diakses, tetapi link detail tidak terbaca',
    'REACHABLE_LINKS_REJECTED':'Dapat diakses, tetapi kandidat belum memenuhi kriteria kelayakan',
    'REACHABLE_CANDIDATES':'Dapat diakses dan kandidat ditemukan',
    'ONLINE_SOURCE_REACHABLE_NO_LINKS':'Sumber resmi terjangkau, tetapi link detail tidak terbaca',
    'ONLINE_SOURCE_CANDIDATES_REJECTED':'Sumber resmi dapat diakses, tetapi kandidat belum memenuhi kriteria kelayakan',
    'ONLINE_SOURCE_REACHABLE_NO_CANDIDATE':'Sumber resmi terjangkau, belum ada kandidat yang dapat dipakai'
  };
  return map[v]||String(value||'-').replaceAll('_',' ').toLowerCase();
}

function renderOfficialVerification(verification,snapshot){
  const v=verification||{}, sum=v.summary||{};
  let out='';
  if(Object.keys(v).length){
    out+=`<div class="case-meta"><b>Pemeriksaan sumber hukum resmi</b> • ${escapeHtml(humanizeVerificationStatus(v.status||'NOT_VERIFIED'))} • ${sum.results_found||0} hasil • Verifikasi profesional: ${escapeHtml(humanizeVerificationStatus(v.professional_verification||'PENDING'))}</div>`;
  }
  if(snapshot&&Object.keys(snapshot).length) out+=renderCaseScopedRegulatory(snapshot);
  officialSourcesResult.style.display=out?'block':'none';
  officialSourcesResult.innerHTML=out;
}

function renderCaseReadiness(profile){
  if(!profile||typeof profile!=='object'){
    caseReadiness.innerHTML='<div class="result">Belum ada readiness review.</div>';
    return;
  }

  const p=Math.max(0,Math.min(100,Number(
    profile.overall_percentage ?? profile.overall_score ?? 0
  )));

  const dims=profile.dimensions||{};
  const comps=profile.components||{};

  const pick=(...values)=>{
    for(const v of values){
      if(v==null) continue;
      const raw=(typeof v==='object')
        ? (v.score ?? v.percentage)
        : v;
      if(raw!=null && Number.isFinite(Number(raw))){
        return Math.max(0,Math.min(100,Math.round(Number(raw))));
      }
    }
    return 0;
  };

  const rows=[
    ['Evidence Map',
      pick(dims.facts_completeness,comps.evidence_map)],

    ['Analisis Hukum',
      pick(dims.legal_basis_authority,comps.legal_analysis)],

    ['Action Plan',
      pick(dims.procedural_strategy,comps.action_plan)]
  ];

  const caption=profile.disclaimer
    ||'Mengukur kelengkapan persiapan perkara, bukan peluang menang/kalah.';

  caseReadiness.innerHTML=
    `<div class="readiness-top">`+
      `<div class="readiness-donut" style="--p:${p}">`+
        `<strong>${p}%</strong><small>readiness</small>`+
      `</div>`+
      `<div class="readiness-bars">`+
        rows.map(([label,v])=>
          `<div class="readiness-row">`+
            `<span>${escapeHtml(label)}</span>`+
            `<div class="readiness-track">`+
              `<div class="readiness-fill" style="width:${v}%"></div>`+
            `</div>`+
            `<b>${v}%</b>`+
          `</div>`
        ).join('')+
      `</div>`+
    `</div>`+
    `<div class="readiness-caption">${escapeHtml(caption)}</div>`;
}
function renderWorkingPaperProbability(wp){
  const p=(wp&&wp.working_paper_percentage)||{};
  const plus=p.variables_increasing||[], minus=p.variables_decreasing||[];
  if(!Object.keys(p).length)return '<div class="result">Case Readiness belum tersedia.</div>';
  const factor=(title,arr)=>`<div class="wp-factor"><h4>${escapeHtml(title)}</h4>${arr.length?`<ul>${arr.map(v=>`<li><b>${v.impact>0?'+':''}${escapeHtml(v.impact||0)} poin</b> — ${escapeHtml(v.variable||'-')}<br><small>${escapeHtml(v.basis||'')}</small></li>`).join('')}</ul>`:'<small>-</small>'}</div>`;
  return `<div class="wp-score"><div class="wp-scorebox"><strong>${escapeHtml(p.percentage||0)}%</strong><small>kematangan kertas kerja</small><small>tingkat kelengkapan: ${escapeHtml(({LOW:'Rendah',MEDIUM:'Sedang','MEDIUM-HIGH':'Sedang–Tinggi',HIGH:'Tinggi'})[p.confidence]||p.confidence||'Rendah')}</small></div><div><div class="wp-factor-grid">${factor('Variabel Penambah Nilai',plus)}${factor('Variabel Pengurang Nilai',minus)}</div><div class="readiness-caption">${escapeHtml(p.disclaimer||'Mengukur kesiapan dan kelengkapan analisis; bukan peluang menang/kalah.')}</div></div></div>`;
}
function e2aItem(label,statement,evidence,segment){
  const raw=String(label||'SOURCE FACT').trim();
  const css=raw.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const ev=evidence?`<div class="e2a-quote"><b>Bukti:</b> ${escapeHtml(evidence)}</div>`:'';
  const seg=segment!==undefined&&segment!==null&&String(segment).trim()!==''?`<div><small>Segmen: ${escapeHtml(segment)}</small></div>`:'';
  return `<div class="e2a-item ${css}"><span class="e2a-label">${escapeHtml(raw)}</span><br><b>${escapeHtml(statement||'-')}</b>${ev}${seg}</div>`;
}

function renderWorkingEvidence(wp,ledger){
  const em=(wp&&wp.evidence_map)||{}, basis=em.legal_basis||{}, rows=em.rows||[];
  let out=`<div class="result"><b>Dasar pemetaan:</b> ${escapeHtml(basis.citation||'Belum ditentukan')}<br><small>${escapeHtml(basis.note||'')}</small></div>`;
  out+=rows.length?`<div style="overflow:auto"><table class="wp-table"><thead><tr><th>Sumber/Bukti Potensial</th><th>Proposisi Faktual yang Perlu Diuji</th><th>Status Pembuktian</th><th>Uji Lanjut</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${escapeHtml(r.evidence_tool||'-')}</b><br><small>${escapeHtml(r.source_label||'')}</small></td><td>${escapeHtml(r.fact_proved||'-')}</td><td>${escapeHtml(r.formal_strength||'-')}</td><td>${escapeHtml(r.opponent_evidence_weakness||'-')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="result">Belum ada evidence matrix terstruktur.</div>';
  const sourceFacts=(ledger||[]).filter(v=>v&&v.statement);
  out+=`<details style="margin-top:14px"><summary><b>Jejak Sumber Material</b> (${sourceFacts.length} item)</summary><div class="e2a-list" style="margin-top:10px">${sourceFacts.length?sourceFacts.slice(0,100).map(v=>e2aItem(humanizeCaseEvidenceClass(v.display_classification||v.source_classification||v.label),v.statement,v.evidence,v.segment)).join(''):e2aItem('Pernyataan sumber','Tidak ada sumber material yang layak ditampilkan.','',null)}</div></details>`;
  return out;
}
function humanizeCaseEvidenceClass(v){const m={ACTUAL_EVIDENTIARY_ITEM:'Dokumen/bukti primer yang teridentifikasi',EVIDENCE_ASSERTION:'Klaim mengenai keberadaan bukti/dokumen',CASE_FACT:'Fakta perkara dari sumber non-pleading',PLEADED_FACT:'Fakta yang didalilkan dalam dokumen',ALLEGED_ROLE:'Peran/jabatan yang didalilkan',PLEADING_ASSERTION:'Dalil/pleading',SOURCE_FACT:'Pernyataan sumber',PARTY_IDENTITY:'Identitas pihak',DOCUMENT_METADATA:'Metadata dokumen',PROCEDURAL_METADATA:'Metadata prosedural',PETITUM_OR_PRAYER:'Petitum/permohonan',LEGAL_ARGUMENT:'Argumentasi hukum',HEADING_OR_SECTION:'Judul/bagian dokumen',NON_MATERIAL_FRAGMENT:'Fragmen nonmaterial'};return m[v]||String(v||'-').replaceAll('_',' ');}
function humanizeConstructionStatus(v){const m={REQUIRES_VERIFICATION:'Belum cukup dasar — perlu verifikasi',EVIDENCE_NEXUS_FOUND_LAW_UNVERIFIED:'Bukti terkait ditemukan — dasar hukum belum terverifikasi',PROVISIONALLY_SUPPORTED:'Dukungan sementara — tetap perlu verifikasi',SEMANTIC_NEXUS_ONLY:'Keterkaitan topik ditemukan — daya bukti belum cukup'};return m[v]||String(v||'-').replaceAll('_',' ');}
function humanizeLegalDocumentType(v){const m={EKSEPSI_OR_OBJECTION:'Eksepsi / nota keberatan',CIVIL_PLEADING:'Dokumen gugatan/perdata',CRIMINAL_PLEADING:'Dokumen perkara pidana',CONTRACT:'Kontrak/perjanjian',LEGAL_DOCUMENT:'Dokumen hukum'};return m[v]||String(v||'-').replaceAll('_',' ');}
function renderExecutiveLegalReview(x){
  const r=x.professional_review||{}, findings=(r.findings||[]).slice(0,6), sr=r.strategic_recommendation||{};
  if(!Object.keys(r).length)return '';
  const status=({HOLD_FOR_VERIFICATION:'Tahan kesimpulan — verifikasi diperlukan',REVISE_BEFORE_RELIANCE:'Perlu revisi sebelum dijadikan dasar tindakan',PROVISIONAL_REVIEW_COMPLETE:'Review sementara selesai'})[r.review_status]||r.review_status||'-';
  const sev={CRITICAL:'Kritis',HIGH:'Tinggi',MEDIUM:'Sedang',LOW:'Rendah'};
  const typ={TEMPUS_GAP:'Tempus / waktu perbuatan',LEGAL_CITATION_ANOMALY:'Rujukan regulasi',ENTITY_NAME_VARIANT:'Identitas pihak',NUMBER_DATE_INCONSISTENCY:'Konsistensi tanggal/nomor',FORUM_VS_MERITS:'Kompetensi vs pokok perkara',ERROR_IN_PERSONA_VS_ATTRIBUTION:'Error in persona vs atribusi',FIDUCIARY_NON_DISPOSITIVE:'Agunan/fidusia',EVIDENTIARY_GAP:'Celah pembuktian',NO_VERIFIED_APPLICABLE_LAW:'Hukum positif'};
  let html=`<div class="e2a-item executive-review"><b>Ringkasan Review Hukum</b><br><small>Status: ${escapeHtml(status)} • Ringkasan strategis untuk lawyer; detail audit tersedia di bawah.</small>`;
  if(findings.length)html+=`<div style="overflow:auto;margin-top:10px"><table class="wp-table"><thead><tr><th>Aspek</th><th>Posisi/Teks Dokumen</th><th>Temuan</th><th>Rekomendasi</th></tr></thead><tbody>${findings.map(f=>`<tr><td><b>${escapeHtml(typ[f.type]||String(f.type||'Temuan').replaceAll('_',' '))}</b><br><small>${escapeHtml(sev[f.severity]||f.severity||'-')}</small></td><td>${escapeHtml(f.source_text||'-')}</td><td>${escapeHtml(f.finding||'-')}</td><td>${escapeHtml(f.recommendation||'-')}</td></tr>`).join('')}</tbody></table></div>`;
  const pri=(sr.priorities||[]).slice(0,3); if(pri.length)html+=`<div class="e2a-quote" style="margin-top:10px"><b>Prioritas strategis</b><ol>${pri.map(v=>`<li>${escapeHtml(v)}</li>`).join('')}</ol></div>`;
  return html+'</div>';
}
function renderProfessionalReview(x){
  const r=x.professional_review||{};
  if(!r||!Object.keys(r).length)return '';
  const sevLabel={CRITICAL:'Kritis',HIGH:'Tinggi',MEDIUM:'Sedang',LOW:'Rendah'};
  const typeLabel={POTENTIAL_TEXT_TYPO:'Potensi salah ketik/OCR',NUMBER_DATE_INCONSISTENCY:'Ketidaksesuaian nomor dan tanggal',ENTITY_NAME_VARIANT:'Variasi identitas pihak',TEMPUS_GAP:'Celah tempus / waktu perbuatan',LEGAL_CITATION_ANOMALY:'Anomali rujukan hukum',FORUM_VS_MERITS:'Kompetensi/forum vs pokok perkara',ERROR_IN_PERSONA_VS_ATTRIBUTION:'Error in persona vs atribusi',FIDUCIARY_NON_DISPOSITIVE:'Fidusia tidak menentukan sendiri hasil perkara',SOURCE_NOISE_HIGH:'Kandungan sumber nonmaterial tinggi',EVIDENTIARY_GAP:'Gap pembuktian',NO_VERIFIED_APPLICABLE_LAW:'Hukum berlaku belum terverifikasi',DOCUMENT_STRUCTURE:'Struktur dokumen'};
  const findings=(r.findings||[]).slice(0,18), recs=(r.recommendations||[]).slice(0,14), strengths=(r.strengths||[]).slice(0,8), st=r.document_structure||{};
  let html=`<div class="e2a-item" style="margin-top:12px"><b>Review Profesional</b><br><small>Review berlapis: struktur dokumen, fakta vs argumentasi, anomali teks/identitas/tanggal/rujukan, pengaman hukum, kelemahan dalil, dan rekomendasi.</small><div style="margin-top:8px"><b>Status:</b> ${escapeHtml(({HOLD_FOR_VERIFICATION:'Tahan kesimpulan — verifikasi diperlukan',REVISE_BEFORE_RELIANCE:'Perlu revisi sebelum dijadikan dasar tindakan',PROVISIONAL_REVIEW_COMPLETE:'Review sementara selesai'})[r.review_status]||r.review_status||'-')} • <b>Tipe dokumen:</b> ${escapeHtml(humanizeLegalDocumentType(st.document_type||'-'))}${st.completeness!==null&&st.completeness!==undefined?` • <b>Struktur:</b> ${escapeHtml(st.completeness)}%`:''}</div></div>`;
  if(strengths.length)html+=`<div class="e2a-item"><b>Kekuatan yang Teridentifikasi</b><ul>${strengths.map(v=>`<li>${escapeHtml(v)}</li>`).join('')}</ul></div>`;
  if(findings.length)html+=`<div class="e2a-item"><b>Temuan Kritis & Kelemahan</b>${findings.map(f=>`<div class="e2a-quote"><b>${escapeHtml(typeLabel[f.type]||f.type||'Temuan')} — ${escapeHtml(sevLabel[f.severity]||f.severity||'-')}</b><br>${escapeHtml(f.finding||'-')}${f.source_text?`<br><small><b>Teks sumber:</b> ${escapeHtml(f.source_text)}</small>`:''}${f.candidate?`<br><small><b>Kandidat:</b> ${escapeHtml(f.candidate)}</small>`:''}<br><small><b>Rekomendasi:</b> ${escapeHtml(f.recommendation||'-')}</small></div>`).join('')}</div>`;
  if(recs.length)html+=`<div class="e2a-item"><b>Rekomendasi Prioritas</b><ol>${recs.map(a=>`<li><b>${escapeHtml(a.priority||'P2')}</b> — ${escapeHtml(a.action||'-')}<br><small>${escapeHtml(a.basis||'')}</small></li>`).join('')}</ol></div>`;
  const sr=r.strategic_recommendation||{}, sp=sr.priorities||[], outline=sr.recommended_outline||[];
  if(sp.length||outline.length)html+=`<div class="e2a-item"><b>Rekomendasi Strategis Penyusunan</b>${sr.approach?`<div style="margin-top:6px"><small>Pendekatan: ${escapeHtml(({REBUILD_OBJECTION_AROUND_FORMAL_DEFECTS:'Bangun ulang eksepsi berfokus pada cacat formil/prosedural',ISSUE_EVIDENCE_LAW_RECOMMENDATION:'Isu → bukti → hukum → rekomendasi'})[sr.approach]||String(sr.approach).replaceAll('_',' '))}</small></div>`:''}${sp.length?`<ol>${sp.map(v=>`<li>${escapeHtml(v)}</li>`).join('')}</ol>`:''}${outline.length?`<div class="e2a-quote"><b>Struktur yang direkomendasikan</b><br>${outline.map((v,i)=>`${i+1}. ${escapeHtml(v)}`).join('<br>')}</div>`:''}</div>`;
  return html;
}

function renderAdversarialViewpointSplitter(x){
  const vm=x.adversarial_viewpoint_splitter||{};
  if(!Object.keys(vm).length)return '';
  const renderItem=(it,klass,roleLabel)=>`<div class="adv-card ${klass}"><div class="adv-badges"><span class="adv-badge adv-role">${escapeHtml(roleLabel)}</span><span class="adv-badge adv-state">${escapeHtml(it.admissibility_state||'UNRESOLVED')}</span><span class="adv-badge adv-state">${escapeHtml(it.semantic_type||'UNCLASSIFIED')}</span></div><div class="adv-stmt">${escapeHtml(it.text||'-')}</div><div class="adv-lineage"><b>Statement:</b> ${escapeHtml(it.statement_id||'-')} · <b>Target:</b> ${escapeHtml(it.target_node||'-')}<br><b>Trace:</b> ${escapeHtml(it.trace_label||'[Sumber Netral / Belum Terverifikasi]')} · <b>Route:</b> ${escapeHtml((it.allowed_consumers||[]).join(', ')||'NONE')}</div></div>`;
  const pros=(vm.prosecution||[]), defs=(vm.defense||[]), neutral=(vm.neutral||[]);
  const prosHtml=pros.length?pros.map(it=>renderItem(it,'prosecution','Posisi JPU')).join(''):'<div class="adv-empty">Belum ada statement dengan ownership PROSECUTOR yang lolos Route Token Ledger.</div>';
  const defHtml=defs.length?defs.map(it=>renderItem(it,'defense','Posisi PH')).join(''):'<div class="adv-empty">Belum ada statement dengan ownership DEFENSE_COUNSEL yang lolos Route Token Ledger.</div>';
  const neutralHtml=neutral.length?`<details style="margin-top:10px"><summary><b>Sumber netral / ownership belum teridentifikasi (${neutral.length})</b></summary><div class="adv-column" style="margin-top:9px">${neutral.slice(0,8).map(it=>renderItem(it,'neutral','Sumber Netral')).join('')}</div></details>`:'';
  return `<div class="e2a-item adversarial-view"><div class="adversarial-head"><div><b>Adversarial Viewpoint Splitter</b><br><small>Read-only projection dari SAL Route Token Ledger; renderer tidak melakukan reclassification.</small></div><span class="badge">${escapeHtml(vm.contract_version||'ADV-VIEW-1.1')}</span></div><div class="adversarial-grid"><div><div class="adv-column-title">JAKSA PENUNTUT UMUM / PROSECUTION</div><div class="adv-column" style="margin-top:8px">${prosHtml}</div></div><div><div class="adv-column-title">PENASIHAT HUKUM / DEFENSE</div><div class="adv-column" style="margin-top:8px">${defHtml}</div></div></div>${neutralHtml}<div class="adv-note">Tanpa Route Token: ${escapeHtml(vm.blocked_without_route_token||0)} statement tidak ditampilkan. Warna hanya penanda sekunder; label posisi tetap authoritative.</div></div>`;
}

function renderLegalConstruction(wp,x){
  const lc=(wp&&wp.legal_construction)||{}, chains=lc.chains||[], guard=x.reasoning_guard||{};
  let out=renderExecutiveLegalReview(x);
  out+=`<div class="result"><b>Konstruksi Utama</b><br>${escapeHtml(lc.synthesis||x.legal_analysis||'-')}</div>`;
  out+=renderProfessionalReview(x);
  const gates=guard.gates||[], anomalies=guard.citation_anomalies||[], boundaries=guard.boundary_checks||[], tempus=guard.tempus||{};
  if(gates.length||anomalies.length||boundaries.length){
    const gateLabel={CASE_NEXUS:'Keterkaitan perkara',CORRUPTION_NEXUS:'Keterkaitan Tipikor',TEMPUS:'Waktu berlakunya hukum',INSTRUMENT_IDENTITY:'Identitas peraturan',ARGUMENT_CLASSIFICATION:'Klasifikasi dalil'};
    const statusLabel={TRIGGERED:'Terdeteksi',TRIGGERED_NOT_PROVEN:'Terdeteksi — belum terbukti',BLOCKS_DEFINITIVE_APPLICABLE_LAW:'Menahan kesimpulan final',REQUIRES_VERIFICATION:'Perlu verifikasi',BLOCKS_SILENT_NORMALIZATION:'Wajib verifikasi dokumen asli',REQUIRES_BOUNDARY_REVIEW:'Perlu pemisahan isu',NOT_TRIGGERED:'Tidak terpicu'};
    out+=`<div class="e2a-item" style="margin-top:12px"><b>Pengaman Penalaran Hukum</b><div style="margin-top:8px">${gates.map(g=>`<div><b>${escapeHtml(gateLabel[g.gate]||g.gate||'-')}:</b> ${escapeHtml(statusLabel[g.status]||g.status||'-')}<br><small>${escapeHtml(g.reason||'')}</small></div>`).join('<hr style="border:0;border-top:1px solid #e7edf4;margin:8px 0">')}</div>${tempus.note?`<div class="e2a-quote" style="margin-top:10px"><b>Catatan tempus:</b> ${escapeHtml(tempus.note)}</div>`:''}</div>`;
    if(anomalies.length)out+=`<div class="e2a-item"><b>Rujukan hukum yang perlu dicocokkan</b>${anomalies.map(a=>`<div class="e2a-quote"><b>Teks dokumen:</b> ${escapeHtml(a.source_text||'-')}<br><b>${escapeHtml(a.candidate_normalization||'')}</b><br><small>${escapeHtml(a.instruction||'')}</small></div>`).join('')}</div>`;
    if(boundaries.length)out+=`<div class="e2a-item"><b>Batas Konstruksi Dalil</b>${boundaries.map(b=>`<div style="margin-top:8px"><b>${escapeHtml(b.finding||'-')}</b><br><small>${escapeHtml(b.required_check||'')}</small></div>`).join('')}</div>`;
  }
  if(chains.length)out+=`<div style="overflow:auto"><table class="wp-table"><thead><tr><th>Isu</th><th>Fakta Material</th><th>Bukti Pendukung</th><th>Aturan Hukum</th><th>Jalinan Kausalitas</th><th>Status</th></tr></thead><tbody>${chains.map(c=>`<tr><td>${escapeHtml(c.issue||'-')}</td><td>${escapeHtml(c.material_fact||'-')}</td><td><b>${escapeHtml(humanizeCaseEvidenceClass(c.supporting_evidence||'-'))}</b><br><small>${escapeHtml(c.evidence_reference||'')}</small>${Number(c.evidence_nexus_score||0)>0?`<br><small>Keterkaitan topik: ${Math.round(Number(c.evidence_nexus_score||0)*100)}% • ${escapeHtml(c.evidence_nexus_reason||'')}</small>`:''}${c.probative_reason?`<br><small><b>Bobot pembuktian:</b> ${escapeHtml(({HIGH:'Tinggi',MEDIUM:'Sedang',LOW:'Rendah',NONE:'Belum memadai'})[c.probative_level]||c.probative_level||'-')} ${Number(c.probative_score||0)>0?`(${Math.round(Number(c.probative_score||0)*100)}%)`:''} • ${escapeHtml(c.probative_reason)}</small>`:''}</td><td>${escapeHtml(c.legal_rule||'-')}</td><td>${escapeHtml(c.causal_logic||'-')}</td><td>${escapeHtml(humanizeConstructionStatus(c.construction_status||'-'))}</td></tr>`).join('')}</tbody></table></div>`;
  const ets=x.element_test_summary||{}, elm=x.element_matrix||[], emap=x.evidence_to_element_mapping||[];
  if(elm.length){
    out+=`<div class="e2a-item" style="margin-top:12px"><b>Element-by-Element Test</b><br><small>${escapeHtml(ets.assessed||0)}/${escapeHtml(ets.total||elm.length)} elemen memiliki mapping sumber (${escapeHtml(ets.percentage||0)}%). Mapping tidak sama dengan pemenuhan unsur secara hukum.</small><div style="overflow:auto;margin-top:8px"><table class="wp-table"><thead><tr><th>Elemen</th><th>Supporting Evidence</th><th>Counter-Evidence</th><th>Status</th></tr></thead><tbody>${elm.map(e=>`<tr><td>${escapeHtml(e.element||e.description||'-')}</td><td>${(e.supporting_evidence||[]).slice(0,3).map(v=>`<div><small>#${escapeHtml(v.source_index)} ${escapeHtml(v.statement||'')}</small></div>`).join('')||'-'}</td><td>${(e.counter_evidence||[]).slice(0,3).map(v=>`<div><small>#${escapeHtml(v.source_index)} ${escapeHtml(v.statement||'')}</small></div>`).join('')||'-'}</td><td>${escapeHtml(e.status||'NOT_ESTABLISHED')}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  const issues=x.issue_element_tests||[];
  if(issues.length){out+=`<div class="e2a-item"><b>Issue → Element → Evidence → Counter-Evidence</b>${issues.map(i=>`<div class="e2a-quote" style="margin-top:10px"><b>${escapeHtml(i.issue||'-')}</b><br><small>Status mapping: ${escapeHtml(i.status||'NOT_ESTABLISHED')} • Kesimpulan hukum: ${escapeHtml(i.legal_conclusion||'VERIFICATION_REQUIRED')}</small><div style="overflow:auto;margin-top:7px"><table class="wp-table"><thead><tr><th>Elemen</th><th>Support</th><th>Counter</th><th>Status</th></tr></thead><tbody>${(i.elements||[]).map(e=>`<tr><td>${escapeHtml(e.description||'-')}<br><small>Mapping confidence: ${Math.round(Number(e.mapping_confidence||0)*100)}%</small></td><td>${(e.supporting_evidence||[]).slice(0,2).map(v=>`<small>#${escapeHtml(v.source_index)} ${escapeHtml(v.statement||'')}</small>`).join('<br>')||'-'}</td><td>${(e.counter_evidence||[]).slice(0,2).map(v=>`<small>#${escapeHtml(v.source_index)} ${escapeHtml(v.statement||'')}</small>`).join('<br>')||'-'}</td><td>${escapeHtml(e.status||'NOT_ESTABLISHED')}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div>`;}
  const ca=x.causation_analysis||{}; if(Object.keys(ca).length) out+=`<div class="e2a-item"><b>Causation / Impact Nexus</b><br>${escapeHtml(ca.status||'NOT_ASSESSED')}<br><small>${escapeHtml(ca.reason||'')}</small></div>`;
  const risks=x.risk_assessment||[]; if(risks.length) out+=`<div class="e2a-item"><b>Risk Classification per Issue</b>${risks.map(r=>`<div style="margin-top:8px"><b>${escapeHtml(r.classification||'UNASSESSED')}</b> — ${escapeHtml(r.issue||'-')}<br><small>${escapeHtml(r.basis||'')}</small></div>`).join('')}</div>`;
  const mit=x.mitigation_strategy||{}; if(Object.keys(mit).length) out+=`<div class="e2a-item"><b>Mitigation Strategy</b><br><small>Intent: ${escapeHtml(mit.intent||'-')} • Impact: ${escapeHtml(mit.impact||'-')} • Proportionality: ${escapeHtml(mit.proportionality||'-')}</small>${(mit.corrective_action||[]).length?`<div style="margin-top:8px"><b>Corrective action yang terdeteksi</b>${(mit.corrective_action||[]).map(v=>`<div><small>#${escapeHtml(v.source_index)} ${escapeHtml(v.statement||'')}</small></div>`).join('')}</div>`:''}</div>`;
  const ps=x.pleading_strategy||{}; if((ps.strategy_sequence||[]).length) out+=`<div class="e2a-item"><b>Recommended Pleading Strategy</b><ol>${(ps.strategy_sequence||[]).map(v=>`<li>${escapeHtml(String(v).replaceAll('_',' '))}</li>`).join('')}</ol><small>${escapeHtml(ps.note||'')}</small></div>`;
  const sal=x.semantic_admission_ledger||x.semantic_admission||{};
  if(Object.keys(sal).length){
    const sc=sal.semantic_type_counts||{}, ac=sal.admissibility_counts||{};
    const fmt=o=>Object.entries(o).map(([k,v])=>`${escapeHtml(k)}=${escapeHtml(v)}`).join(' · ')||'-';
    out+=`<div class="e2a-item"><b>Semantic Admission Layer (SAL v1.0)</b><br><small>Contract ${escapeHtml(sal.contract_version||'SAL-1.0')} · ${escapeHtml(sal.contract_status||'-')} · Air-gap ${escapeHtml(sal.air_gap_policy||'FAIL_CLOSED')}</small><div class="e2a-quote" style="margin-top:8px"><small><b>Admissibility:</b> ${fmt(ac)}<br><b>Semantic types:</b> ${fmt(sc)}</small></div></div>`;
  }
  out+=renderAdversarialViewpointSplitter(x);
  const lrc=x.legal_reasoning_chain||{}, rc=x.reasoning_contract||{};
  if((lrc.chains||[]).length){
    const chainRows=(lrc.chains||[]).map(r=>{
      const law=r.applicable_law||{}, selected=law.selected||{}, ev=(r.evidence||{}).items||[], ce=(r.counter_evidence||{}).items||[], acts=(r.recommended_action||{}).actions||[];
      const evTxt=ev.slice(0,2).map(v=>`<small>#${escapeHtml(v.source_index??'-')} ${escapeHtml(v.statement||'-')}</small>`).join('<br>')||'-';
      const ceTxt=ce.slice(0,2).map(v=>typeof v==='object'?`<small>#${escapeHtml(v.source_index??'-')} ${escapeHtml(v.statement||'-')}</small>`:`<small>${escapeHtml(v)}</small>`).join('<br>')||'-';
      const actTxt=acts.slice(0,2).map(v=>`<small>${escapeHtml(v.action||v.issue||'-')}</small>`).join('<br>')||'-';
      return `<div class="e2a-quote" style="margin-top:10px"><b>${escapeHtml(r.chain_id||'-')} · ${escapeHtml(r.status||'-')}</b><br><small><b>Issue:</b> ${escapeHtml((r.issue||{}).value||'-')}<br><b>Applicable Law:</b> ${escapeHtml(law.rule||selected.source||'-')} (${escapeHtml(law.status||'MISSING')})<br><b>Legal Element:</b> ${escapeHtml((r.legal_elements||{}).element||'-')}<br><b>Alleged Act:</b> ${escapeHtml((r.alleged_act||{}).value||'-')}<br><b>Evidence:</b><br>${evTxt}<br><b>Counter-Evidence:</b><br>${ceTxt}<br><b>Element Test:</b> ${escapeHtml((r.element_test||{}).status||'-')} / ${escapeHtml((r.element_test||{}).gate||'HOLD')}<br><b>Causation:</b> ${escapeHtml((r.causation||{}).status||'GAP')} — ${escapeHtml((r.causation||{}).value||'-')}<br><b>Risk:</b> ${escapeHtml((r.risk||{}).level||'-')} — ${escapeHtml((r.risk||{}).value||'-')}<br><b>Procedural/Merits:</b> ${escapeHtml((r.procedural_merits_classification||{}).value||'-')}<br><b>Recommended Action:</b><br>${actTxt}</small></div>`;
    }).join('');
    out+=`<div class="e2a-item"><b>Canonical Legal Reasoning Chain</b><br><small>Contract ${escapeHtml(rc.contract_version||lrc.contract_version||'2.0')} · Structural ${escapeHtml(rc.status||lrc.goal_status||'-')} · Semantic ${escapeHtml(rc.semantic_status||'-')}</small><div class="e2a-quote" style="margin-top:8px"><small>Issue → Applicable Law → Legal Elements → Alleged Act → Evidence → Counter-Evidence → Element Test → Causation → Risk → Procedural/Merits Classification → Recommended Action</small></div>${chainRows}</div>`;
  }
  const regs=x.regulatory_matches||[], caseReg=x.case_regulatory_snapshot||{}, nc=x.norm_conflicts||{}, conf=nc.conflicts_detected||[], laws=x.applicable_law||[];
  out+=`<div class="module-link-grid compact-links" style="margin-top:14px"><button class="module-link-card" onclick="openCaseRegulatory()"><span class="module-kicker">CORPUS · SUMBER REGULASI</span><b>${caseReg.official_results_count||regs.length} hasil perkara</b><em>Lihat Regulatory Corpus →</em></button><button class="module-link-card" onclick="openCaseResearch()"><span class="module-kicker">RESEARCH · VERIFIKASI</span><b>${laws.length} rujukan</b><em>Verifikasi →</em></button><button class="module-link-card" onclick="openCaseNorms()"><span class="module-kicker">NORM CONFLICT · ANTINOMI</span><b>${conf.length} flag</b><em>Buka Conflicts →</em></button></div>`;
  return out;
}
function renderTacticalActionPlan(wp){
  const rows=(wp&&wp.action_plan)||[];
  if(!rows.length)return '<div class="result">Belum ada action plan taktis terstruktur.</div>';
  return rows.map(r=>`<div class="wp-step"><div class="wp-stepnum">${escapeHtml(r.step||'-')}</div><div><span class="priority ${escapeHtml(r.priority||'P2')}">${escapeHtml(r.priority||'P2')}</span><br><small>${escapeHtml(r.time_window||'-')}</small></div><div><b>${escapeHtml(r.action||'-')}</b><div style="margin-top:6px"><small><b>Tujuan:</b> ${escapeHtml(r.objective||'-')}<br><b>Kondisi:</b> ${escapeHtml(r.condition||'-')}${r.why_it_matters?`<br><b>Catatan:</b> ${escapeHtml(r.why_it_matters)}`:''}</small></div></div></div>`).join('');
}
function renderFourScriptAnalysis(x){
  const esc=escapeHtml;
  const list=(items,empty='Tidak teridentifikasi.')=>Array.isArray(items)&&items.length?`<ul class="lc4-list">${items.map(v=>`<li>${esc(typeof v==='string'?v:(v?.finding||v?.issue||v?.statement||String(v)))}</li>`).join('')}</ul>`:`<p class="lc4-muted">${esc(empty)}</p>`;
  const score=Math.max(0,Math.min(100,Math.round(Number(x.overall_risk_score||0))));
  const issues=Array.isArray(x.legal_issues)?x.legal_issues:[];
  const laws=Array.isArray(x.applicable_law)?x.applicable_law:[];
  const risks=Array.isArray(x.risk_matrix)&&x.risk_matrix.length?x.risk_matrix:(Array.isArray(x.risks)?x.risks:[]);
  const riskTone=level=>String(level||'MEDIUM').toUpperCase();
  const buckets=x.statement_buckets||{};
  const actors=Array.isArray(x.actor_matrix)?x.actor_matrix:[];
  const timeline=Array.isArray(x.verified_timeline)?x.verified_timeline:[];
  const gaps=Array.isArray(x.legal_gaps)?x.legal_gaps:[];
  const paths=Array.isArray(x.multi_path_diagnosis)?x.multi_path_diagnosis:[];
  const integration=Array.isArray(x.integration_matrix)?x.integration_matrix:[];
  const blank=Array.isArray(x.blank_spot_questions)?x.blank_spot_questions:[];
  const strategy=Array.isArray(x.tactical_strategy)?x.tactical_strategy:[];
  const retrieval=x.official_law_retrieval||{};
  const matrix=(headers,rows)=>rows.length?`<div class="lc4-table-wrap"><table class="lc4-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="lc4-muted">Belum terpetakan.</p>';
  const grounding=`<section class="lc4-section"><h3>Grounding · Fakta, Klaim & Anomali</h3><div class="lc4-grid"><div><b>Fakta Tekstual</b>${list(buckets.textual_facts)}</div><div><b>Dalil / Klaim Pihak</b>${list(buckets.party_claims)}</div></div><div style="margin-top:12px"><b>Anomali / Kontradiksi</b>${list(buckets.anomalies)}</div></section>`;
  const actorTable=`<section class="lc4-section"><h3>Matriks Aktor & Status Hukum</h3>${matrix(['Aktor','Status Terbukti','Hak/Kewajiban Eksplisit','Evidence Tag'],actors.map(a=>[esc(a.actor||'-'),esc(a.proven_status||'-'),esc(a.explicit_rights_obligations||'-'),esc(a.evidence_tag||'-')]))}</section>`;
  const timelineHtml=`<section class="lc4-section"><h3>Kronologi Terverifikasi</h3>${matrix(['Waktu','Peristiwa','Evidence Tag'],timeline.map(t=>[esc(t.time||'-'),esc(t.event||'-'),esc(t.evidence_tag||'-')]))}</section>`;
  const gapsHtml=`<section class="lc4-section"><h3>Bedah Celah Hukum & Ambiguitas</h3>${gaps.length?gaps.map(g=>`<article class="lc4-item"><b>${esc(g.gap||'-')}</b><p>${esc(g.why_material||'-')}</p><small>${esc(g.evidence_tag||'[KLAIM KOSONG]')}</small></article>`).join(''):'<p class="lc4-muted">Belum terpetakan.</p>'}</section>`;
  const pathsHtml=`<section class="lc4-section"><h3>Diagnosis Multi-Jalur Hukum</h3>${paths.length?paths.map(p=>`<article class="lc4-item"><b>${esc(p.path||'-')} · ${esc(p.strength||'-')}</b><p><b>Teori:</b> ${esc(p.legal_theory||'-')}</p><p><b>Application:</b> ${esc(p.application||'-')}</p><p><b>Counter-case:</b> ${esc(p.counter_case||'-')}</p>${list(p.evidence_needed,'Tidak ada bukti tambahan yang dicatat.')}</article>`).join(''):'<p class="lc4-muted">Belum terpetakan.</p>'}</section>`;
  const integrationHtml=`<section class="lc4-section"><h3>Matriks Integrasi Bukti & Regulasi</h3>${matrix(['Aktor','Tindakan Faktual','Nexus KB Lokal','Nexus Hukum Online','Risiko'],integration.map(r=>[esc(r.actor||'-'),`${esc(r.factual_act||'-')}<br><small>${esc(r.evidence_tag||'')}</small>`,esc(r.local_kb_nexus||'-'),esc(r.online_law_nexus||'-'),esc(r.risk||'-')]))}</section>`;
  const onlineHtml=`<section class="lc4-section"><h3>Online Official-Law Discovery</h3><p class="lc4-muted">Query: ${esc((retrieval.queries||[]).join(' · ')||'Mode lokal / belum ada query')}</p>${Array.isArray(retrieval.candidates)&&retrieval.candidates.length?`<div class="lc4-table-wrap"><table class="lc4-table"><thead><tr><th>Instrumen</th><th>Status</th><th>Tempus</th><th>Sumber</th></tr></thead><tbody>${retrieval.candidates.slice(0,12).map(c=>`<tr><td><b>${esc(c.title||'-')}</b></td><td>${esc(c.status||'-')}<br><small>${esc(c.effective_status||'')}</small></td><td>${esc(c.tempus_status||'UNVERIFIED')}</td><td>${c.url?`<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Sumber resmi/discovery</a>`:'-'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="lc4-muted">Tidak ada kandidat online pada run ini.</p>'}</section>`;
  const tacticalHtml=`<section class="lc4-section"><h3>Strategi Taktis & Blank Spot Audit</h3>${strategy.length?`<ol class="lc4-list">${strategy.map(s=>`<li><b>${esc(s.priority||'P2')} · ${esc(s.action||'-')}</b><br><small>${esc(s.objective||'-')}</small></li>`).join('')}</ol>`:list(x.recommendations)}<h4 style="margin-top:16px">Pertanyaan Investigatif yang Hilang</h4>${list(blank,'Belum ada blank-spot questions.')}</section>`;
  return `<div class="lc4-report">
    <section class="lc4-hero"><div><span class="lc4-doc">${esc(x.document_type||x.domain_classification?.primary_domain||'Dokumen hukum')}</span><p>${esc(x.summary||'Ringkasan belum tersedia.')}</p></div><div class="lc4-score"><strong>${score}</strong><span>Skor risiko</span></div><div class="lc4-track"><i class="${score>=67?'high':score>=34?'medium':'low'}" style="width:${score}%"></i></div></section>
    ${grounding}${actorTable}${timelineHtml}
    <div class="lc4-grid"><section class="lc4-section"><h3>Fakta material</h3>${list(x.facts)}</section><section class="lc4-section"><h3>Isu hukum · IRAC Advanced</h3>${issues.length?issues.map(i=>`<article class="lc4-item"><b>${esc(i.issue||'-')}</b>${i.rule?`<p><b>Rule:</b> ${esc(i.rule)}</p>`:''}<p><b>Application:</b> ${esc(i.analysis||'-')}</p>${i.conclusion?`<p><b>Tactical conclusion:</b> ${esc(i.conclusion)}</p>`:''}</article>`).join(''):'<p class="lc4-muted">Tidak teridentifikasi.</p>'}</section></div>
    ${gapsHtml}${pathsHtml}${onlineHtml}
    <section class="lc4-section"><h3>Dasar hukum yang relevan</h3>${laws.length?`<div class="lc4-table-wrap"><table class="lc4-table"><thead><tr><th>Peraturan</th><th>Pasal</th><th>Relevansi / Verifikasi</th></tr></thead><tbody>${laws.map(l=>`<tr><td><b>${esc(l.regulation||l.domain||l.source||'-')}</b>${l.source_url?`<br><small><a href="${esc(l.source_url)}" target="_blank" rel="noopener noreferrer">sumber</a></small>`:''}</td><td>${esc(l.article||'PERLU VERIFIKASI')}</td><td>${esc(l.relevance||l.status||'-')}<br><small>${esc(l.tempus_status||l.verification_status||'')}</small></td></tr>`).join('')}</tbody></table></div>`:'<p class="lc4-muted">Tidak ada rujukan yang dapat dipastikan.</p>'}</section>
    ${integrationHtml}
    <section class="lc4-section"><h3>Matriks risiko</h3>${risks.length?`<div class="lc4-risk-list">${risks.map((r,idx)=>{const obj=typeof r==='string'?{clause:`Risiko ${idx+1}`,level:'MEDIUM',finding:r,mitigation:'Verifikasi fakta dan bukti sebelum menentukan tindakan.'}:r;const lvl=riskTone(obj.level);return `<article class="lc4-risk"><div><span class="lc4-risk-pill ${lvl.toLowerCase()}">${esc(lvl)}</span><b>${esc(obj.clause||`Risiko ${idx+1}`)}</b></div><p>${esc(obj.finding||'-')}</p><p class="lc4-mitigation"><b>Mitigasi:</b> ${esc(obj.mitigation||'Perlu ditentukan setelah verifikasi.')}</p></article>`}).join('')}</div>`:'<p class="lc4-muted">Tidak ada risiko signifikan teridentifikasi.</p>'}</section>
    <div class="lc4-grid"><section class="lc4-section"><h3>Argumen yang menguatkan</h3>${list(x.arguments_for)}</section><section class="lc4-section"><h3>Counter-case / kelemahan</h3>${list(x.arguments_against)}</section></div>
    <div class="lc4-grid"><section class="lc4-section"><h3>Skenario terbaik</h3><p>${esc(x.best_case||'-')}</p></section><section class="lc4-section"><h3>Skenario terburuk</h3><p>${esc(x.worst_case||'-')}</p></section></div>
    ${tacticalHtml}
    <p class="lc4-verification">${esc(x.verification_note||'Verifikasi profesional masih PENDING. Hasil ini wajib diperiksa oleh advokat terhadap dokumen asli dan hukum positif yang berlaku.')}</p>
  </div>`;
}
function renderCaseWorkingPaper(x){
  const wp=x.case_working_paper||{}, ledger=x.material_source_ledger||[];
  const safeRender=(pane,renderer,fallback)=>{
    try{ pane.innerHTML=renderer(); }
    catch(err){
      console.error('Case Analysis renderer error:',err);
      pane.innerHTML=`<div class="result">${escapeHtml(fallback)}<br><small>${escapeHtml(err&&err.message?err.message:String(err||''))}</small></div>`;
    }
  };
  safeRender(caseSourcePane,()=>renderWorkingPaperProbability(wp),'Case Readiness gagal ditampilkan.');
  safeRender(caseEvidencePane,()=>renderWorkingEvidence(wp,ledger),'Evidence Map gagal ditampilkan.');
  safeRender(caseAnalysisPane,()=>renderFourScriptAnalysis(x),'Analysis Report gagal ditampilkan.');
  safeRender(caseActionPane,()=>renderTacticalActionPlan(wp),'Action Plan gagal ditampilkan.');
}
function statusBadge(status){
  const map={DONE:['P3','Selesai'],PARTIAL:['P2','Sebagian'],NOT_SEPARATELY_MODELED:['P2','Belum dipetakan terpisah']};
  const [cls,label]=map[status]||['P2',status||'-'];
  return `<span class="priority ${cls}">${escapeHtml(label)}</span>`;
}
function renderLivingAnalysis(la){
  if(!la||!Array.isArray(la.steps)||!la.steps.length)return '<div class="result">Living Analysis belum tersedia untuk hasil ini.</div>';
  const steps=la.steps.map(s=>`<div class="e2a-item"><span class="e2a-label">Langkah ${s.step} — ${escapeHtml(s.name||'')}</span> ${statusBadge(s.status)}${s.question?`<div style="margin-top:4px"><small><b>Pertanyaan:</b> ${escapeHtml(s.question)}</small></div>`:''}<div style="margin-top:6px">${escapeHtml(s.summary||'-')}</div>${(s.evidence&&s.evidence.length)?`<div class="e2a-quote">${s.evidence.map(escapeHtml).join(' · ')}</div>`:''}<div style="margin-top:6px"><small style="color:var(--muted)">Sumber: ${escapeHtml(s.source||'-')}</small></div></div>`).join('');
  const cl=la.critic_loop||{};
  const order=[['draft_analysis','Draft Analysis'],['critic','Critic'],['counter_analysis','Counter Analysis'],['evidence_check','Evidence Check'],['law_verification','Law Verification'],['final_synthesis','Final Synthesis']];
  const loop=order.map(([k,label])=>{
    const node=cl[k]||{};
    return `<div class="decision-col"><h4>${escapeHtml(label)}</h4>${node.question?`<small><b>${escapeHtml(node.question)}</b></small><br>`:''}<small>${escapeHtml(node.summary||'-')}</small>${(node.evidence&&node.evidence.length)?`<ul>${node.evidence.map(e=>`<li><small>${escapeHtml(e)}</small></li>`).join('')}</ul>`:''}<div style="margin-top:6px"><small style="color:var(--muted)">${escapeHtml(node.source||'')}</small></div></div>`;
  }).join('');
  const lls=la.living_law_synthesis||null;
  const llsHtml=renderLivingLawSynthesis(lls);
  return `<div class="result">${escapeHtml(la.note||'')}</div><h3 style="margin:16px 0 8px">14 Langkah Living Analysis</h3><div class="e2a-list">${steps}</div><h3 style="margin:18px 0 8px">Critic Loop</h3><div class="decision-cols">${loop}</div><h3 style="margin:18px 0 8px">Living Law & Judicial Realism</h3>${llsHtml}`;
}
function riskRow(label,r){
  r=r||{};
  const lvl=Number(r.risk_level)||0;
  const cls=lvl>=7?'P1':(lvl>=4?'P2':'P3');
  return `<tr><td><b>${escapeHtml(label)}</b></td><td><small>${escapeHtml(r.formal_exposure||'-')}</small></td><td><small>${escapeHtml(r.living_law_reality||'-')}</small></td><td><span class="priority ${cls}">${lvl||'-'}/10</span></td></tr>`;
}
function renderLivingLawSynthesis(lls){
  if(!lls)return '<div class="result">Belum dijalankan pada hasil ini.</div>';
  if(lls.status!=='GENERATED'){
    return `<div class="result">${escapeHtml(lls.note||'Layer Living Law/Judicial Realism tidak tersedia pada run ini.')}</div>`;
  }
  const og=lls.operational_gap||{}, cn=lls.customary_commercial_norms||{}, jd=lls.judicial_disposition||{};
  const rm=lls.risk_matrix||{}, sm=lls.strategic_mitigation||{};
  const exList=(arr)=>(arr&&arr.length)?`<ul>${arr.map(e=>`<li><small>${escapeHtml(e)}</small></li>`).join('')}</ul>`:'';
  return `
  <div class="e2a-list">
    <div class="e2a-item"><span class="e2a-label">Operational Gap (Law in Action vs Law in Books)</span><div style="margin-top:6px">${escapeHtml(og.summary||'-')}</div>${exList(og.examples)}</div>
    <div class="e2a-item"><span class="e2a-label">Customary & Commercial Norms</span><div style="margin-top:6px">${escapeHtml(cn.summary||'-')}</div>${exList(cn.examples)}</div>
    <div class="e2a-item"><span class="e2a-label">Judicial Disposition</span><div style="margin-top:6px">${escapeHtml(jd.summary||'-')}</div>${jd.predictability_note?`<div style="margin-top:6px"><small><b>Prediktabilitas:</b> ${escapeHtml(jd.predictability_note)}</small></div>`:''}${jd.caution?`<div style="margin-top:6px"><small><b>Catatan kehati-hatian:</b> ${escapeHtml(jd.caution)}</small></div>`:''}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-top:12px" class="result"><thead><tr><th style="text-align:left">Dimensi Risiko</th><th style="text-align:left">Formal Exposure</th><th style="text-align:left">Living Law Reality</th><th style="text-align:left">Level</th></tr></thead><tbody>
    ${riskRow('Regulatory Enforcement',rm.regulatory_enforcement)}
    ${riskRow('Contractual Enforceability',rm.contractual_enforceability)}
    ${riskRow('Socio-Reputational Impact',rm.socio_reputational_impact)}
  </tbody></table>
  <div class="decision-cols" style="margin-top:12px">
    <div class="decision-col"><h4>Contractual Safeguards</h4>${exList(sm.contractual_safeguards)}</div>
    <div class="decision-col"><h4>Operational Workarounds</h4>${exList(sm.operational_workarounds)}</div>
    <div class="decision-col"><h4>Litigation Readiness</h4>${exList(sm.litigation_readiness)}</div>
  </div>
  <div class="result" style="margin-top:10px"><small>${escapeHtml(lls.disclaimer||'')}</small></div>`;
}
function actionProjection(profile,issue){
  const ps=(profile&&profile.projections)||[]; if(!ps.length)return null;
  const it=String(issue||'').toLowerCase(), toks=it.split(/\W+/).filter(x=>x.length>4);
  return ps.find(p=>{const r=String(p.requirement||'').toLowerCase();return toks.some(t=>r.includes(t))})||ps[0];
}

function newCaseProgressId(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():'case-'+Date.now()+'-'+Math.random().toString(36).slice(2)}
function caseProgressLabel(stage){
  const m={REQUEST_ACCEPTED:'Menyiapkan Case Analysis',UPLOAD_STORED:'Dokumen tersimpan',DOCUMENT_READING:'Membaca dokumen / OCR',DOCUMENT_READING_COMPLETE:'Pembacaan dokumen selesai',CASE_MAPPING:'Memetakan perkara',CASE_MAPPING_COMPLETE:'Pemetaan perkara selesai',LEGAL_RETRIEVAL:'Menelusuri hukum positif',LEGAL_RETRIEVAL_COMPLETE:'Penelusuran hukum selesai',LEGAL_ANALYSIS:'Menganalisis perkara',REASONING_GUARDS:'Menguji konsistensi hukum',PROFESSIONAL_REVIEW:'Professional review',WORKING_PAPER:'Menyusun Working Paper',SAVING:'Menyimpan hasil',COMPLETED:'Analisis selesai'};
  return m[stage]||'Memproses Case Analysis';
}
function startCaseProgressPolling(token){
  let stopped=false,timer=null;
  const tick=async()=>{if(stopped)return;try{const r=await fetch(API+'/case-analysis/progress/'+encodeURIComponent(token),{cache:'no-store'});if(!r.ok)return;const d=await r.json(),p=d.data||{};setBusyProgress(p.percent||0,caseProgressLabel(p.stage),p.detail||'Pembacaan dan analisis sedang berlangsung.');if(p.stage==='UPLOAD_STORED'){caseFileUploadStored=true;setCaseUploadStatus('uploaded');}}catch(_){}};
  tick();timer=setInterval(tick,700);
  return ()=>{stopped=true;if(timer)clearInterval(timer)};
}

let caseAnalysisInFlight=false;
let caseFileUploadStored=false;
async function analyzeCase(){
  if(caseAnalysisInFlight){toast('Case Analysis masih berjalan. Progres aktif ditampilkan pada layar.');return;}
  const narrative=(caseNarrative.value||'').trim(), f=caseFile.files[0];
  caseFileUploadStored=false;
  if(!f && narrative.length<120)return toast('Tanpa dokumen, narasi minimal 120 karakter diperlukan. Jika dokumen/scan sudah dipilih, narasi boleh dikosongkan.');
  let fd=new FormData();fd.append('title',(caseTitle.value||'Case Analysis').trim());fd.append('narrative',narrative);fd.append('regulatory_mode',caseRegulatoryMode.value||'hybrid');const manualSources=(document.getElementById('caseManualOfficialSources')?.value||'').trim();fd.append('official_source_strategy',manualSources?'manual_plus_auto':'auto');fd.append('manual_official_sources',manualSources);if((caseClientId.value||'').trim())fd.append('client_id',caseClientId.value.trim());if((caseClientName.value||'').trim())fd.append('client_name',caseClientName.value.trim());if(f)fd.append('file',f);
  const progressId=newCaseProgressId();
  currentCaseAnalysis=null;caseExportPdf.disabled=true;caseExportDocx.disabled=true;caseToDraftBtn.disabled=true;caseToComplianceBtn.disabled=true;caseMeta.textContent='Menyiapkan pembacaan dokumen dan analisis...';caseRelatedRecords.innerHTML='';
  caseSourcePane.innerHTML='<div class="result">Menunggu hasil Case Readiness...</div>';caseEvidencePane.innerHTML='<div class="result">Menunggu evidence map...</div>';caseAnalysisPane.innerHTML='<div class="result">Menunggu analisis hukum...</div>';caseActionPane.innerHTML='<div class="result">Menunggu action plan...</div>';
  const selectedMode=caseRegulatoryMode.value||'hybrid';
  officialSourcesResult.innerHTML=selectedMode==='offline'?'Mode Lokal aktif: analisis dasar hukum memakai corpus lokal tanpa fetch online.':selectedMode==='online'?'Mode Online aktif: corpus lokal hanya menjadi indeks; kandidat dasar hukum harus berasal dari sumber resmi yang berhasil dijangkau.':'Mode Hybrid aktif: corpus lokal dipakai sebagai kandidat dan sumber resmi online akan dicek bila tersedia.';
  caseAnalysisInFlight=true;syncCaseProcessStrip();
  return withBusy(f?'Membaca dokumen & menganalisis perkara':'Menganalisis perkara',async()=>{
    const stopProgress=startCaseProgressPolling(progressId);
    try{
      let d=await jsonWithTimeout(API+'/case-analysis',{method:'POST',headers:{'X-Lexicore-Progress-Id':progressId},body:fd},720000),x=d.data,dr=x.document_reading||{};
      setBusyProgress(100,'Analisis selesai','Working Paper siap ditinjau.');
      currentCaseAnalysis=x;caseExportPdf.disabled=false;caseExportDocx.disabled=false;caseToDraftBtn.disabled=false;caseToComplianceBtn.disabled=false;renderCaseReadiness(x.analysis_readiness||x.case_readiness);syncCaseProcessStrip();
      const prov=x.analysis_provenance||{};
      const ing=x.document_ingestion||{};
      const modeLabel=String(prov.mode||x.analytical_method||'').toUpperCase().includes('LOCAL')?'Analisis lokal':(String(prov.mode||x.analytical_method||'').toUpperCase().includes('AI')?'Analisis berbantuan AI':'Analisis perkara');
      const ingInfo=ing.mode?` • Pembacaan dokumen: ${ing.pages_ocr?`OCR ${ing.pages_ocr}/${ing.pages_total||ing.pages_ocr} halaman`:'teks dokumen'}${ing.manual_review_required?` • <b>Manual review OCR diperlukan</b> (${Math.round(Number(ing.coverage_ratio||0)*100)}% coverage)`:''}`:'';
      const sourceMode=x.regulatory_corpus_status?.requested_mode||x.case_regulatory_snapshot?.mode||selectedMode;
      const sourceModeText=sourceMode==='offline'?'Dasar hukum: Lokal':sourceMode==='online'?'Dasar hukum: Online resmi':'Dasar hukum: Hybrid';
      caseMeta.innerHTML=`<b>${escapeHtml(x.title)}</b> • ${escapeHtml(modeLabel)} • ${escapeHtml(sourceModeText)} • ${escapeHtml(humanizeVerificationStatus(dr.status||'UNKNOWN'))} • ${dr.segments_read||0}/${dr.segments_total||0} bagian terbaca • ${(dr.characters||0).toLocaleString('id-ID')} karakter${ingInfo} • Verifikasi profesional: <b>${escapeHtml(humanizeVerificationStatus(x.professional_verification||'PENDING'))}</b>`;
      renderCaseWorkingPaper(x);
      renderOfficialVerification(x.official_verification,x.case_regulatory_snapshot||null);showCaseAnalysisCompleteNotice();renderCaseRelatedRecords(x.case_analysis_id||x.id);loadAll();refreshClientIdOptions();
    }catch(e){
      const p=e&&e.payload&&e.payload.progress;
      if(e&&e.status===409&&p){
        const pct=Math.round(Number(p.percent||0));
        caseMeta.textContent=`Case Analysis sebelumnya masih aktif (${pct}%). ${p.detail||'Tunggu proses server selesai.'}`;
        caseAnalysisPane.innerHTML=`<div class="result">Proses Case Analysis yang sudah berjalan masih aktif: <b>${pct}%</b><br>${escapeHtml(p.detail||'Tunggu proses aktif selesai sebelum mengirim analisis baru.')}</div>`;
        toast(`Case Analysis aktif ${pct}% — tidak dibuat proses duplikat.`);
      }else{
        caseMeta.textContent=e.message;caseAnalysisPane.innerHTML=`<div class="result">${escapeHtml(e.message)}</div>`;toast(e.message);
      }
    }finally{stopProgress();caseAnalysisInFlight=false;syncCaseProcessStrip()}
  })
}

function renderCaseScopedRegulatory(snapshot){
  snapshot=snapshot||{};
  const domains=snapshot.domains||[], queries=snapshot.queries||[], allResults=snapshot.official_results||[];
  const localResults=Array.isArray(snapshot.local_results)?snapshot.local_results:[];
  const localMode=(snapshot.mode==='offline'||snapshot.requested_mode==='offline'||snapshot.reasoning_source_route==='REGULATORY_CORPUS_ONLY');
  const results=allResults.filter(r=>{const v=r.positive_law_verification||{};return v.final_status!=='VERIFIED_NOT_RELEVANT'&&v.final_status!=='UNVERIFIED_IDENTITY_MISMATCH'&&v.final_status!=='REJECTED_NON_LEGAL_CONTENT'&&v.case_nexus_status!=='NO_CASE_NEXUS';});
  const f=snapshot.retrieval_funnel||{}, diag=snapshot.official_diagnostics||{}, localDiag=snapshot.local_corpus_diagnostics||{};
  const materialCount=localMode?localResults.length:results.length;
  let out=`<div class="case-meta"><b>PENELUSURAN REGULASI TERKAIT PERKARA</b> • ${materialCount} ${localMode?'hasil material lokal':'hasil material'} • ${snapshot.local_seed_count||0} acuan lokal • Verifikasi profesional: ${escapeHtml(humanizeVerificationStatus(snapshot.professional_verification||'PENDING'))}</div>`;
  if(localMode){
    out+=`<div class="e2a-item"><b>Alur pencarian Regulatory Corpus</b><div class="e2a-quote">Corpus ${localDiag.corpus_size||0} → kandidat broad ${localDiag.stage1_size||0} → strict HIGH/MEDIUM ${localDiag.strict_count||0} → dipilih ${localDiag.selected_count||localResults.length||0}${localDiag.fallback_used?' → fallback LOW_CONFIDENCE aktif':''}</div><small>Mode Lokal: pencarian online dinonaktifkan. Semua kandidat berasal dari Regulatory Corpus.</small></div>`;
    if(localResults.length){
      out+=`<div class="e2a-item"><b>Hasil material Regulatory Corpus</b><div class="e2a-list" style="margin-top:8px">${localResults.map((r,i)=>{const arts=Array.isArray(r.articles)?r.articles:[];return `<div class="e2a-item"><b>${i+1}. ${escapeHtml(r.regulation||r.title||'-')}</b> — ${escapeHtml(r.confidence||'LOW')} confidence<div class="e2a-quote">${escapeHtml(r.title||'')}</div><small>Relevansi ${Number(r.relevance_score)||0}% • Stage1 ${Number(r.stage1_score)||0} • Material ${Number(r.material_score)||0} • Issue ${Number(r.issue_hits)||0} • Frase ${Number(r.issue_phrase_hits)||0} • Anchor ${Number(r.anchor_hits)||0} • Pasal-match ${Number(r.article_hits)||0}${r.citation_hit?' • explicit citation':''}<br>${arts.length?arts.map(a=>`${escapeHtml(a.pasal||'-')}${a.topic?` — ${escapeHtml(a.topic)}`:''}`).join(' • '):'Pasal relevan belum terpetakan'}</small></div>`}).join('')}</div></div>`;
    }
  }else if(Object.keys(f).length){
    out+=`<div class="e2a-item"><b>Alur pemeriksaan regulasi</b><div class="e2a-quote">Ditemukan ${f.discovered||0} sumber → ${f.unique_discovered||0} sumber unik → ${f.candidate||0} kandidat diperiksa → ${f.materially_relevant||0} memiliki keterkaitan materi → ${f.temporal_not_excluded||0} lolos pemeriksaan awal waktu berlaku → ${f.authoritative_source_located||0} sumber resmi teridentifikasi → akses sumber dicoba ${f.fetch_attempted||0} / berhasil ${f.fetch_reachable||0} → halaman detail ditemukan ${f.search_links_found||0} / diperiksa ${f.search_links_selected||0} → ${f.candidate_policy_rejected||0} kandidat tidak digunakan → identitas peraturan terverifikasi ${f.instrument_identity_verified||0} → status hukum terverifikasi ${f.positive_law_verified||0} → waktu berlaku terverifikasi ${f.tempus_verified||0} → relevan dan berlaku ${f.verified_applicable||0} → pasal ditemukan ${f.provision_located||0}/${f.provision_requested||0} → teks pasal terverifikasi ${f.provision_verified||0}/${f.provision_requested||0}${f.not_attempted_budget_exceeded?` → ${f.not_attempted_budget_exceeded} sumber belum diperiksa karena batas proses pencarian`:''}</div>${snapshot.event_year_candidate?`<small>Perkiraan tahun peristiwa: ${escapeHtml(snapshot.event_year_candidate)}. Pemeriksaan waktu berlaku ini masih merupakan penyaringan awal, bukan penetapan final norma yang berlaku.</small>`:''}</div>`;
  }
  if(!localMode&&(snapshot.official_provider_status||Object.keys(diag).length)){
    const stageCounts=diag.rejection_stage_counts||{};
    const reasonCounts=diag.rejection_reason_counts||{};
    const stageLabels={
      topical_policy:'Keterkaitan dengan isu perkara',
      instrument_identity:'Kejelasan identitas peraturan',
      positive_law:'Status hukum peraturan',
      temporal_applicability:'Kesesuaian waktu berlaku',
      provision:'Kejelasan pasal yang relevan'
    };
    const humanizeStage=(key)=>stageLabels[key]||'Pemeriksaan kelayakan sumber';
    const humanizeReason=(raw)=>{
      const s=String(raw||'').trim();
      if(!s)return '';
      if(/nexus score/i.test(s))return 'Keterkaitan dengan isu perkara belum cukup kuat';
      if(/hierarchy\/domain policy rejected/i.test(s))return 'Tingkat atau bidang peraturan tidak sesuai dengan kebutuhan perkara';
      if(/missing instrument number\/year/i.test(s))return 'Nomor atau tahun peraturan belum dapat dipastikan';
      if(/query-specific hits/i.test(s))return 'Hasil pencarian yang sesuai dengan isu masih belum cukup kuat';
      if(/material anchors?\s+\d+\/\d+/i.test(s))return 'Keterkaitan material dengan pokok perkara belum memadai';
      if(/insufficient independent concept support/i.test(s))return 'Dukungan konsep hukum yang relevan belum cukup';
      if(/minimal satu material anchor kuat tidak ditemukan/i.test(s))return 'Tidak ditemukan keterkaitan material yang cukup kuat';
      if(/subtopic guard:/i.test(s))return 'Topik khusus pada sumber tidak sesuai dengan pokok perkara';
      return 'Kandidat belum memenuhi kriteria kelayakan sumber';
    };
    const stageText=Object.keys(stageCounts).map(k=>`${humanizeStage(k)} (${stageCounts[k]})`).join(' • ');
    const reasonText=Object.keys(reasonCounts).slice(0,6).map(k=>`${humanizeReason(k)} (${reasonCounts[k]})`).join(' • ');
    const rawNotes=Array.isArray(snapshot.official_notes)?snapshot.official_notes:[];
    const publicNotes=[];
    for(const note of rawNotes){
      const n=String(note||'').trim();
      if(!n)continue;
      if(/Strict identity guard|Exact citation|material-nexus|independent concept support|lexical fallback|ontology|issue-driven query/i.test(n)){
        publicNotes.push('Pemeriksaan identitas sumber diterapkan secara ketat. Jenis peraturan, lembaga penerbit, nomor, tahun, keterkaitan dengan isu, dan kecocokan materi harus cukup jelas sebelum sumber digunakan.');
      }else{
        publicNotes.push(n.replace(/identity\/material-nexus/gi,'identitas dan keterkaitan materi'));
      }
    }
    const notesHtml=[...new Set(publicNotes)].length?`<small>${escapeHtml([...new Set(publicNotes)].join(' '))}</small>`:'';
    const perQuery=Array.isArray(diag.per_query_selected)?diag.per_query_selected:[];
    const perQueryHtml=perQuery.length?`<details style="margin-top:10px"><summary><b>Rincian pencarian</b> (${perQuery.length})</summary><div class="e2a-list" style="margin-top:8px">${perQuery.map(q=>`<div class="e2a-item"><b>${escapeHtml(String(q.query||'').slice(0,100))}</b><div class="e2a-quote">dipilih ${Number(q.selected)||0} dari ${Number(q.available)||0} hasil</div></div>`).join('')}</div></details>`:'';
    const providerStatus=escapeHtml(humanizeVerificationStatus(snapshot.official_provider_status||diag.provider_status||'UNKNOWN'));
    out+=`<div class="e2a-item"><b>Diagnosis sumber resmi</b><div class="e2a-quote">Status sumber resmi: ${providerStatus} • pencarian berhasil diakses ${diag.reachable_searches||0}/${diag.search_attempts||0} • gagal diakses ${diag.fetch_failures||0} • pencarian tanpa halaman detail ${diag.no_detail_link_searches||0} • tautan ditemukan ${diag.found_links||0} • kandidat diperiksa ${diag.selected_links||0} • tidak digunakan ${diag.candidate_rejections||0} • sumber akhir ${diag.final_candidates||0}</div>${stageText?`<small>Alasan kandidat tidak digunakan: ${escapeHtml(stageText)}</small>`:''}${reasonText?`<small>Rincian alasan: ${escapeHtml(reasonText)}</small>`:''}${notesHtml}${perQueryHtml}</div>`;
    const manualRes=Array.isArray(snapshot.manual_authority_resolutions)?snapshot.manual_authority_resolutions:[];
    if(manualRes.length)out+=`<div class="e2a-item"><b>Referensi sumber resmi pengguna</b><div class="e2a-quote">Referensi prioritas terverifikasi ${manualRes.filter(r=>r.status==='RESOLVED').length}/${manualRes.length} · pencarian otomatis tetap aktif</div>${manualRes.map(r=>`<div style="margin-top:7px"><small><b>${escapeHtml(r.input||'-')}</b> — ${escapeHtml(r.status||'-')}<br>${escapeHtml(r.message||'')}${r.candidate?.url?`<br><a href="${escapeHtml(r.candidate.url)}" target="_blank" rel="noopener noreferrer">Buka sumber resmi</a>`:''}${Array.isArray(r.alternatives)&&r.alternatives.length?`<br>Kandidat: ${r.alternatives.slice(0,3).map(a=>escapeHtml(a.title||'-')).join(' • ')}`:''}</small></div>`).join('')}</div>`;
  }
  if(domains.length){
    const fmtDomain=(d)=>{
      const label=escapeHtml(d.label||d.id||'-');
      const score=Number(d.score);
      if(Number.isFinite(score) && score>0) return `${label} (skor ${Math.round(score)})`;
      const conf=d.confidence;
      if(typeof conf==='string' && conf){
        const map={HIGH:'Tinggi',MEDIUM:'Sedang',LOW:'Rendah'};
        return `${label} (${map[String(conf).toUpperCase()]||escapeHtml(conf)})`;
      }
      if(typeof conf==='number' && Number.isFinite(conf)) return `${label} (${Math.round(conf*100)}%)`;
      return label;
    };
    out+=`<div class="e2a-list"><div class="e2a-item"><b>Ruang lingkup terdeteksi</b><div>${domains.map(fmtDomain).join(' • ')}</div></div></div>`;
  }
  if(queries.length)out+=`<div class="e2a-item"><b>Query terarah</b><div class="e2a-quote">${queries.map(q=>escapeHtml(q)).join('<br>')}</div></div>`;
  if(results.length)out+=`<h3>Hasil Sumber Resmi</h3><div class="e2a-list">${results.map(r=>{const v=r.positive_law_verification||{},pv=v.provision_verification||{},ptl=v.provision_text_location||{};const prov=(pv.requested_count||ptl.requested_count||0)?`<div><small><b>Pasal ditemukan:</b> ${ptl.located_count||0}/${ptl.requested_count||0} • <b>terverifikasi:</b> ${pv.verified_count||0}/${pv.requested_count||0}${(pv.verified||[]).length?' • '+escapeHtml((pv.verified||[]).join(', ')):''}</small></div>`:'';return `<div class="e2a-item"><span class="e2a-label">Sumber resmi</span><br><b>${escapeHtml(r.title||'-')}</b><div><small>${escapeHtml(r.source_name||r.source_id||'Sumber resmi')} • penelusuran: ${escapeHtml(r.query||'-')}</small></div>${v.final_status?`<div><small><b>Status hukum:</b> ${escapeHtml(humanizeVerificationStatus(v.final_status))} • <b>Keterkaitan perkara:</b> ${escapeHtml(humanizeVerificationStatus(v.case_nexus_status||'CASE_NEXUS_UNCERTAIN'))}</small></div>`:''}${prov}${r.url?`<div style="margin-top:8px"><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">Buka sumber resmi ↗</a></div>`:''}</div>`}).join('')}</div>`;
  return out;
}
function openCaseRegulatory(){
  if(!currentCaseAnalysis)return openPanel('corpus');
  const x=currentCaseAnalysis, regs=x.regulatory_matches||[], ri=x.regulatory_intelligence||{}, snap=x.case_regulatory_snapshot||{};
  const first=regs[0]&&regs[0].regulation||{};
  corpusQuery.value=(snap.queries||[])[0]||first.nomor||first.tentang||((x.applicable_law||[])[0]||{}).source||x.title||'';
  corpusResult.innerHTML=renderCaseScopedRegulatory(snap)+`<h3 style="margin-top:16px">Core Seed / Fallback</h3>`+renderCorpusHits(regs)+renderRegulatoryIntelligence({relationships:ri.relationships||[]},{events:ri.timeline||[]});
  openPanel('corpus');
  window.scrollTo({top:0,behavior:'smooth'});
}
function openCaseNorms(){
  if(!currentCaseAnalysis)return openPanel('norm');
  const x=currentCaseAnalysis, nc=x.norm_conflicts||{}, conf=nc.conflicts_detected||[];
  const laws=(x.applicable_law||[]).map(y=>y.source).filter(Boolean);
  const regs=(x.regulatory_matches||[]).map(r=>{const g=r.regulation||{};return g.nomor||g.tentang}).filter(Boolean);
  normProvisions.value=[...new Set([...laws,...regs])].slice(0,12).join('\n');
  normContext.value=[x.title||'',...(x.legal_issues||[]),x.temporal_law_analysis||''].filter(Boolean).join('\n');
  normResult.innerHTML=`<div class="e2a-list">${conf.length?conf.map(c=>`<div class="e2a-item AI-INFERENCE"><span class="e2a-label">${escapeHtml(c.type||'NORM CHECK')}</span><br><b>${escapeHtml(c.rule_principle||'-')} • ${escapeHtml(c.severity||'-')}</b><div>${escapeHtml(c.legal_reasoning||'-')}</div><div class="e2a-quote">Status: ${escapeHtml(c.verification_status||'PENDING')}</div></div>`).join(''):'<div class="result">Belum ada conflict flag.</div>'}</div>`;
  openPanel('norm');
  window.scrollTo({top:0,behavior:'smooth'});
}
function openCaseResearch(){
  if(!currentCaseAnalysis)return openPanel('research');
  const x=currentCaseAnalysis, law=(x.applicable_law||[])[0]||{};
  rTitle.value='Verifikasi hukum — '+(x.title||'Case Analysis');
  rCitation.value=law.source||'';
  rText.value='';
  researchResult.innerHTML='';
  openPanel('research');
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderCorpusHits(rows){
  if(!rows||!rows.length)return '<div class="result">Tidak ada kecocokan pada core regulatory seed.</div>';
  return rows.map(hit=>{
    const g=hit.regulation||hit;
    const arts=hit.matched_articles||g.articles||[];
    return `<div class="e2a-item"><span class="e2a-label">CORE SEED MATCH</span><br><b>${escapeHtml(g.nomor||'-')}</b><div><small>${escapeHtml(g.tentang||'')} • ${escapeHtml(g.jenis||'-')} • status ${escapeHtml(g.status||'-')} • hierarchy ${escapeHtml(g.hierarchy_rank||'-')}</small></div>${arts.length?`<div class="e2a-quote">${arts.slice(0,8).map(a=>`<b>${escapeHtml(a.pasal||'-')}</b> — ${escapeHtml(a.topic||'')}<br>${escapeHtml(a.content||'')}`).join('<br><br>')}</div>`:''}${g.official_url?`<div style="margin-top:8px"><a href="${escapeHtml(g.official_url)}" target="_blank" rel="noopener">Buka sumber resmi ↗</a></div>`:''}</div>`;
  }).join('');
}
function renderRegulatoryIntelligence(graph,timeline){
  graph=graph||{}; timeline=timeline||{};
  const rels=graph.relationships||[], events=timeline.events||[];
  let out='';
  if(rels.length){
    out+=`<h3 style="margin-top:16px">Legal Relationships</h3><div class="e2a-list">${rels.slice(0,12).map(r=>`<div class="e2a-item"><span class="e2a-label">${escapeHtml(r.relation_type||'RELATION')}</span><br><b>${escapeHtml(r.source_citation||r.source_id||'-')}</b><div>→ ${escapeHtml(r.target_citation||r.target_id||'-')}</div><div><small>${escapeHtml(r.verification_status||'OFFICIAL SOURCE VERIFICATION REQUIRED')}</small></div></div>`).join('')}</div>`;
  }
  if(events.length){
    out+=`<h3 style="margin-top:16px">Legal Timeline</h3><div class="e2a-list">${events.slice(0,18).map(e=>`<div class="e2a-item"><span class="e2a-label">${escapeHtml(e.event||'EVENT')}</span><br><b>${escapeHtml(e.date||'-')}</b><div>${escapeHtml(e.citation||'-')}</div><div><small>Status corpus: ${escapeHtml(e.status||'-')}</small></div></div>`).join('')}</div>`;
  }
  return out;
}
function renderRegulatoryHierarchy(groups){
  groups=groups||[];
  if(!groups.length)return '<div class="result">Belum ada pemetaan hierarkis untuk hasil ini.</div>';
  const rows=groups.map(g=>{
    const body=(g.items||[]).map(r=>{
      const provisions=r.specific_provisions||[];
      const prov=provisions.length?provisions.map(p=>`<div class="reg-provision"><b>${escapeHtml(p.pasal||'BELUM TERVERIFIKASI')}</b>${p.ayat?' • '+escapeHtml(p.ayat):''}${p.topic?`<div>${escapeHtml(p.topic)}</div>`:''}${p.content?`<small>${escapeHtml(p.content)}</small>`:''}<span class="reg-verify">${escapeHtml(p.verification_status||'VERIFY OFFICIAL SOURCE')}</span></div>`).join(''):'<div class="reg-provision"><b>Pasal/Ayat: BELUM TERVERIFIKASI</b><span class="reg-verify">Tidak ada provision spesifik yang aman untuk diklaim dari hasil ini.</span></div>';
      const url=r.official_url||r.url;
      return `<tr><td><b>${escapeHtml(r.nomor||r.title||'-')}</b><div>${escapeHtml(r.tentang||r.title||'')}</div><small>Tahun: ${escapeHtml(String(r.tahun||'BELUM TERVERIFIKASI'))} • Status: ${escapeHtml(r.status||r.verification_status||'-')}</small>${url?`<div><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Sumber resmi ↗</a></div>`:''}</td><td>${prov}</td><td>${escapeHtml(r.practical_implication||'Implikasi belum dapat ditarik tanpa verifikasi provision dan fakta perkara.')}</td></tr>`;
    }).join('');
    return `<div class="reg-hierarchy-group"><h3>${g.order||''}. ${escapeHtml(g.label||g.key||'Regulasi')}</h3><div class="reg-map-wrap"><table class="reg-map-table"><thead><tr><th>Nomor & Tahun Peraturan</th><th>Pasal & Ayat Spesifik</th><th>Implikasi Praktis terhadap Posisi Hukum User</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }).join('');
  return `<div class="reg-hierarchy">${rows}<div class="contract-review-note">Hierarchy ini adalah struktur kerja Regulatory Corpus sesuai urutan menu LexiCore. Klaim pasal/ayat yang belum terverifikasi sengaja ditandai dan tidak boleh diperlakukan sebagai dasar hukum final.</div></div>`;
}
async function searchCorpus(){
  const q=(corpusQuery.value||'').trim(); if(q.length<2)return toast('Masukkan kata kunci corpus');
  const mode=(corpusMode.value||'offline'); corpusResult.innerHTML='Mencari regulasi...';
  return withBusy('Menelusuri Regulatory Corpus',async()=>{try{
    const d=await json(API+'/regulations/search?q='+encodeURIComponent(q)+'&mode='+encodeURIComponent(mode));
    const data=d.data||{}, local=data.local_results||[], online=data.online_results||[], counts=data.counts||{};
    let html=`<div class="case-meta">Mode: <b>${escapeHtml(mode.toUpperCase())}</b> • lokal ${local.length} • online legal ${online.length} • non-hukum ditolak ${counts.rejected_non_legal_content||0} • Professional Verification: ${escapeHtml(data.professional_verification||'PENDING')}</div>`;
    html+=renderRegulatoryHierarchy(data.hierarchical_results||[]);
    corpusResult.innerHTML=html||'<div class="result">Tidak ada hasil.</div>';
  }catch(e){corpusResult.textContent=e.message;toast(e.message)}})}
async function loadCorpusCatalog(){
  corpusResult.innerHTML='Memuat katalog...';
  return withBusy('Memuat katalog regulasi',async()=>{try{
    const d=await json(API+'/regulations/catalog');
    corpusResult.innerHTML=`<div class="case-meta">${d.count||0} regulasi • ${(d.counts||{}).articles||0} pasal • ${(d.counts||{}).relationships||0} relasi • ${escapeHtml(d.intelligence_model||d.mode||'CORE_REGULATORY_SEED')}</div><div class="e2a-list">${renderCorpusHits(d.data||[])}</div>`;
  }catch(e){corpusResult.textContent=e.message;toast(e.message)}})}
async function analyzeNormConflict(){
  const context=(normContext.value||'').trim();
  const provisions=(normProvisions.value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  if(provisions.length<2)return toast('Masukkan minimal Aturan A dan Aturan B');
  normResult.innerHTML='Menganalisis konflik norma...';
  return withBusy('Menganalisis konflik norma',async()=>{try{
    const d=await json(API+'/norm-conflicts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provisions,context})});
    const x=d.data||{}, rows=x.rule_comparison_matrix||[], regs=d.regulatory_matches||[], summary=x.summary||{};
    let out=`<div class="case-meta">${escapeHtml(x.detector_mode||'NORM CONFLICT')} • Professional Verification: ${escapeHtml(x.professional_verification||'PENDING')}</div>`;
    out+=`<div class="decision-cols"><div class="decision-col"><h4>${summary.resolved_candidates||0}</h4><small>Resolved Candidate</small></div><div class="decision-col"><h4>${summary.potential_conflicts||0}</h4><small>Potential Conflict</small></div><div class="decision-col"><h4>${summary.relationship_only||0}</h4><small>Relationship Only</small></div></div>`;
    if(rows.length){
      out+=`<div class="table-wrap"><table><thead><tr><th>Aturan A vs Aturan B/C/D...</th><th>Analisis Ketidaksinkronan</th><th>Asas & Applicable Law</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${escapeHtml(r.pair_label||'-')}</b><br><small><b>${escapeHtml((r.norm_a||{}).label||'Aturan A')}:</b> ${escapeHtml((r.norm_a||{}).citation||'-')}</small><br><small><b>${escapeHtml((r.norm_b||{}).label||'Aturan B')}:</b> ${escapeHtml((r.norm_b||{}).citation||'-')}</small></td><td>${escapeHtml(r.contradiction_analysis||'-')}<br><small>Same subject: ${r.same_subject_matter?'YA':'BELUM'} • Antinomi: ${r.antinomy_identified?'YA':'BELUM'}</small></td><td><b>${escapeHtml(r.principle_applied||'NONE')}</b><br><strong>Applicable law:</strong> ${escapeHtml(r.applicable_law||'NOT_DETERMINED')}<br><small>${escapeHtml(r.legal_effect||'')}</small><br><small>${escapeHtml(r.resolution_status||'')}</small></td></tr>`).join('')}</tbody></table></div>`;
    }else out+=`<div class="result">Belum ada pasangan norma yang dapat dibandingkan.</div>`;
    const method=x.principle_method||{};
    out+=`<div class="result"><b>Metode resolver</b><br><small>1. Lex Superior — ${escapeHtml(method.LEX_SUPERIOR||'')}</small><br><small>2. Lex Specialis — ${escapeHtml(method.LEX_SPECIALIS||'')}</small><br><small>3. Lex Posterior — ${escapeHtml(method.LEX_POSTERIOR||'')}</small></div>`;
    out+=`<div class="module-handoff-note">${escapeHtml(x.coverage_note||'')}</div>`;
    if(regs.length)out+=`<div class="module-handoff-note"><b>${regs.length} regulatory match</b><button class="btn soft" onclick="openPanel('corpus')">Buka Corpus →</button></div>`;
    normResult.innerHTML=out;
  }catch(e){normResult.textContent=e.message;toast(e.message)}})}
let clientDraftSaved=false;
let currentClientDocumentId=null;
function clientSelectedDocumentType(){if(cType.value!=='legal_service')return cType.value;return cServiceType.value==='representation_request'?'legal_service_representation_request':'legal_service_consultation';}
function clientLegalPositionConfig(){const map={suspect:{label:'Tersangka',template:'Permohonan Praperadilan',button:'Buka Draft Awal Tersangka →',note:'Template awal: Permohonan Praperadilan. Sesuaikan tahap perkara; bila kebutuhan utamanya penahanan, gunakan template Penangguhan Penahanan.'},defendant:{label:'Terdakwa',template:'Eksepsi Pidana',button:'Buka Draft Awal Terdakwa →',note:'Template awal: Eksepsi Pidana. Bila pemeriksaan telah masuk tahap pembelaan akhir, pilih Nota Pembelaan / Pledoi.'},plaintiff:{label:'Penggugat',template:'Gugatan Perdata',button:'Buka Draft Gugatan →',note:'Template awal: Gugatan Perdata. Verifikasi forum, kompetensi, posita, bukti, dan petitum.'},respondent:{label:'Tergugat',template:'Jawaban Tergugat',button:'Buka Draft Jawaban →',note:'Template awal: Jawaban Tergugat. Eksepsi dapat dipisahkan bila relevan.'}};return map[cLegalPosition?.value||'']||null;}
function updateClientLegalPosition(){const cfg=clientLegalPositionConfig();const btn=document.getElementById('clientPositionDraftBtn');const hint=document.getElementById('clientPositionDraftHint');if(btn){btn.disabled=!cfg;btn.textContent=cfg?cfg.button:'Pilih kedudukan hukum terlebih dahulu';}if(hint)hint.textContent=cfg?cfg.note+' Draft tidak boleh digunakan untuk tindakan eksternal sebelum kewenangan kuasa terverifikasi.':'Draft ini hanya titik awal dan tidak menggantikan verifikasi tahap perkara maupun kewenangan berdasarkan Surat Kuasa.';}
function updateClientServiceMode(){const service=cType.value==='legal_service';const branch=document.getElementById('clientServiceBranch');const note=document.getElementById('clientAuthorityNote');const next=document.getElementById('clientPrimaryNext');if(branch)branch.hidden=!service;if(service&&note){note.innerHTML=cServiceType.value==='representation_request'?'<strong>Permintaan kuasa hukum.</strong> Setelah identitas dan matter lengkap, lanjutkan ke Draft Surat Kuasa Khusus. Contract Review bukan tahap engagement.':'<strong>Konseling / konsultasi.</strong> Catat kebutuhan dan konteks konsultasi tanpa menganggap firma telah menerima kuasa untuk bertindak.';}if(next)next.textContent=service&&cServiceType.value==='representation_request'?'Lanjut ke Draft Surat Kuasa →':'Lanjut: Status & Instruksi →';}
function clientSetFlowStatus(step,message){const el=document.getElementById('clientFlowStatus');if(!el)return;const labels=['Identitas, Matter & Layanan','Status & Instruksi','Review Client Document','Riwayat Komunikasi'];const n=Math.max(1,Math.min(4,Number(step)||1));el.innerHTML=`<span class="client-flow-dot ${n<4?'active':'done'}"></span><b>Langkah ${n} dari 4 — ${escapeHtml(labels[n-1])}</b><span>${escapeHtml(message||'')}</span>`;}
function clientValidateIdentity(){const required=[[cClientId,'ID klien wajib diisi.'],[cName,'Nama klien wajib diisi.'],[cWhatsapp,'Nomor WhatsApp terdaftar wajib diisi.'],[cAddress,'Alamat / domisili klien wajib diisi.'],[cMatter,'Perkara / matter wajib diisi.']];for(const [el,msg] of required){if(!(el.value||'').trim()){toast(msg);el.focus();return false;}}const digits=(cWhatsapp.value||'').replace(/\D/g,'');if(digits.length<10){toast('Nomor WhatsApp belum valid. Gunakan format 08xxxxxxxxxx atau 62xxxxxxxxxx.');cWhatsapp.focus();return false;}return true;}
function clientGoToStatus(){if(!clientValidateIdentity())return;clientSetFlowStatus(2,'Tambahkan status perkara, dokumen, tenggat, dan langkah berikutnya.');lexicoreSectionShow('client',1);}
function clientPrimaryNextAction(){if(cType.value==='legal_service'&&cServiceType.value==='representation_request')return startRepresentationDraft();return clientGoToStatus();}
async function ensureDraftTemplatesReady(templateName){if(!docType?.options?.length||![...docType.options].some(o=>o.value===templateName)){await loadDraftTemplates();}return [...docType.options].some(o=>o.value===templateName);}
async function startRepresentationDraft(){if(!clientValidateIdentity())return;if(!await ensureDraftTemplatesReady('Surat Kuasa Khusus')){toast('Template Surat Kuasa Khusus belum tersedia.');return;}activatePanel('draft');const option=[...docType.options].find(o=>o.value==='Surat Kuasa Khusus');docType.value='Surat Kuasa Khusus';updateDraftForm();party1.value=(cName.value||'').trim();if((cAddress.value||'').trim())party1.value+=' | Alamat: '+(cAddress.value||'').trim();party2.value='';const cfg=clientLegalPositionConfig();prompt.value=['Permintaan menjadi kuasa hukum untuk matter: '+(cMatter.value||'').trim(),cfg?('Kedudukan hukum klien: '+cfg.label):'Kedudukan hukum klien: belum ditentukan', 'Ruang lingkup kewenangan wajib dirinci dan diverifikasi sebelum ditandatangani.','Jangan menganggap kewenangan substitusi, perdamaian, upaya hukum, atau tindakan khusus lain telah diberikan tanpa pernyataan tegas.'].join('\n');currentDraftId=null;draftPreview.textContent='Template Surat Kuasa Khusus siap. Lengkapi identitas Penerima Kuasa dan ruang lingkup kewenangan, lalu Generate Draft.';toast('Matter dialihkan ke Draft Surat Kuasa Khusus.');}
async function startLegalPositionDraft(){if(!clientValidateIdentity())return;const cfg=clientLegalPositionConfig();if(!cfg){toast('Pilih kedudukan hukum klien terlebih dahulu.');cLegalPosition?.focus();return;}if(!await ensureDraftTemplatesReady(cfg.template)){toast('Template '+cfg.template+' belum tersedia.');return;}activatePanel('draft');const option=[...docType.options].find(o=>o.value===cfg.template);docType.value=cfg.template;updateDraftForm();party1.value=(cName.value||'').trim();if((cAddress.value||'').trim())party1.value+=' | Alamat: '+(cAddress.value||'').trim();party2.value='';prompt.value=['Matter: '+(cMatter.value||'').trim(),'Kedudukan hukum klien: '+cfg.label,'Alamat/domisili: '+(cAddress.value||'').trim(),'Template dibuka sebagai draft awal berdasarkan kedudukan hukum; tahap perkara, forum, fakta, bukti, dan kewenangan kuasa tetap wajib diverifikasi sebelum digunakan.'].join('\n');currentDraftId=null;draftPreview.textContent='Template '+cfg.template+' siap. Lengkapi pihak lawan/terkait, fakta, bukti, tahap perkara, dan tujuan dokumen lalu Generate Draft.';toast('Draft awal '+cfg.template+' dibuka berdasarkan kedudukan hukum '+cfg.label+'.');}
function clientNavigateSection(index){const i=Number(index)||0;if(i===0){clientSetFlowStatus(1,'Lengkapi identitas klien dan matter.');lexicoreSectionShow('client',0);return;}if(i===1){clientGoToStatus();return;}if(i===2){if(!(cMessage.value||'').trim()){toast('Client Document belum dibuat. Lengkapi Status & Instruksi lalu pilih Buat Client Document.');lexicoreSectionShow('client',1);return;}clientSetFlowStatus(3,'Review dokumen sebelum disimpan atau dikirim.');lexicoreSectionShow('client',2);return;}clientSetFlowStatus(4,'Buka dokumen tersimpan atau mulai komunikasi baru.');lexicoreSectionShow('client',3);}
function clientValidateInstructions(){const kind=clientSelectedDocumentType();if(kind==='legal_service_representation_request'){toast('Permintaan menjadi kuasa hukum harus dilanjutkan melalui Draft Surat Kuasa Khusus.');return false;}if(kind==='client_update'&&!(cProgress.value||'').trim()){toast('Isi progres / status saat ini agar pembaruan klien tidak menjadi generik.');cProgress.focus();return false;}if(kind==='document_request'&&!(cDeadline.value||'').trim()){toast('Isi tenggat dokumen agar permintaan dokumen memiliki batas waktu yang jelas.');cDeadline.focus();return false;}return true;}
async function generateClient(){if(!clientValidateIdentity()||!clientValidateInstructions())return;return withBusy('Menyusun dokumen klien',async()=>{try{let d=await json(API+'/communication/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:cName.value,client_address:cAddress.value,legal_position:cLegalPosition.value,document_type:clientSelectedDocumentType(),matter:cMatter.value,progress:cProgress.value,requested_documents:cDocs.value,deadline:cDeadline.value,next_step:cNext.value})});cSubject.value=d.data.subject;cMessage.value=d.data.message;clientDraftSaved=false;const st=document.getElementById('clientDocumentState');if(st)st.textContent='Draf dibuat. Review dan edit bila perlu, lalu Simpan Draft atau Kirim WhatsApp.';clientSetFlowStatus(3,'Draf siap direview sebelum disimpan atau dikirim.');lexicoreSectionShow('client',2);toast('Client Document selesai dibuat — silakan review sebelum disimpan atau dikirim.')}catch(e){toast(e.message)}})}
async function saveClient(opts={}){if(!clientValidateIdentity())return false;if(!(cMessage.value||'').trim()){toast('Isi Client Document belum tersedia. Buat dokumen terlebih dahulu.');return false;}return withBusy('Menyimpan dokumen klien',async()=>{try{const payload={client_id:cClientId.value,client_name:cName.value,client_email:cEmail.value,whatsapp_number:cWhatsapp.value,client_address:cAddress.value,legal_position:cLegalPosition.value,subject:cSubject.value,message:cMessage.value,document_type:clientSelectedDocumentType(),status:'draft',matter:cMatter.value,case_id:cCaseId.value||undefined};let d;if(currentClientDocumentId){d=await json(API+'/communications/'+currentClientDocumentId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}else{d=await json(API+'/communications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});currentClientDocumentId=d.data?.id||d.communication?.id||null;}clientDraftSaved=true;const st=document.getElementById('clientDocumentState');if(st)st.textContent='Draft tersimpan. Anda dapat mengirim via WhatsApp atau melihat riwayat.';clientSetFlowStatus(3,'Draft telah disimpan dan siap dikirim.');if(!opts.silent)toast(currentClientDocumentId?'Draft komunikasi klien tersimpan.':'Draft komunikasi klien tersimpan.');await loadAll();return true}catch(e){toast(e.message);return false}})}
async function sendClientWhatsApp(){
  if(!clientValidateIdentity())return;
  if(!(cMessage.value||'').trim()){
    toast('Client Document belum tersedia. Buat dan review dokumen terlebih dahulu.');
    return;
  }

  // Buka tab secara sinkron dari user gesture agar tidak diblokir popup blocker.
  const waWindow=window.open('about:blank','_blank');
  if(!waWindow){
    toast('Browser memblokir jendela WhatsApp. Izinkan pop-up untuk LexiCore lalu coba lagi.');
    return;
  }
  try{
    waWindow.opener=null;
    waWindow.document.title='Menyiapkan WhatsApp…';
    waWindow.document.body.innerHTML='<p style="font-family:Arial,sans-serif;padding:24px">Menyiapkan WhatsApp…</p>';
  }catch{}

  try{
    if(!clientDraftSaved){
      const ok=await saveClient({silent:true});
      if(!ok){waWindow.close();return;}
    }

    await withBusy('Menyiapkan WhatsApp',async()=>{
      const d=await json(API+'/communication/whatsapp-link',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          client_id:cClientId.value,
          whatsapp_number:cWhatsapp.value,
          subject:cSubject.value,
          message:cMessage.value
        })
      });

      const normalized=d.whatsapp_number||d.phone||'';
      const url=d.whatsapp_url||d.whatsapp_link||'';
      if(!url)throw new Error('Link WhatsApp tidak berhasil dibuat.');
      if(normalized)cWhatsapp.value=normalized;

      waWindow.location.replace(url);
      clientSetFlowStatus(4,'WhatsApp composer dibuka. Riwayat draft tetap tersimpan di LexiCore.');
      toast('WhatsApp dibuka — periksa nomor dan isi pesan sebelum menekan Kirim.');
    });
  }catch(e){
    try{waWindow.close()}catch{}
    toast(e?.message||'Gagal membuka WhatsApp.');
  }
}
function resetClientFlow(){currentClientDocumentId=null;['cClientId','cWhatsapp','cName','cEmail','cAddress','cMatter','cProgress','cDocs','cDeadline','cNext','cSubject','cMessage'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});if(document.getElementById('cType'))cType.value='client_update';if(document.getElementById('cServiceType'))cServiceType.value='consultation';if(document.getElementById('cLegalPosition'))cLegalPosition.value='';updateClientServiceMode();updateClientLegalPosition();clientDraftSaved=false;const st=document.getElementById('clientDocumentState');if(st)st.textContent='Belum ada dokumen. Selesaikan Langkah 1–2 terlebih dahulu.';clientSetFlowStatus(1,'Lengkapi identitas klien dan matter.');lexicoreSectionShow('client',0);toast('Form komunikasi baru siap diisi.');}
['cClientId','cWhatsapp','cName','cEmail','cAddress','cMatter','cProgress','cDocs','cDeadline','cNext','cSubject','cMessage','cLegalPosition','cType','cServiceType'].forEach(id=>{
  const el=document.getElementById(id);
  if(!el)return;
  el.addEventListener('input',()=>{if(currentClientDocumentId){clientDraftSaved=false;const st=document.getElementById('clientDocumentState');if(st)st.textContent='Ada perubahan yang belum disimpan.';}});
  el.addEventListener('change',()=>{if(currentClientDocumentId){clientDraftSaved=false;const st=document.getElementById('clientDocumentState');if(st)st.textContent='Ada perubahan yang belum disimpan.';}});
});
function items(arr,fmt){return arr.length?arr.map(fmt).join(''):'<div class="item"><small>Belum ada data.</small></div>'}
function reviewScalar(v){
  if(v===null||v===undefined||v==='') return '-';
  if(typeof v==='string'||typeof v==='number'||typeof v==='boolean') return String(v);
  return '';
}
function reviewObjectCard(obj,index){
  if(obj===null||obj===undefined) return '';
  if(typeof obj!=='object') return `<div class="review-entry">${escapeHtml(String(obj))}</div>`;
  const preferred=['issue','title','name','article','citation','law','regulation','source','status','analysis','reasoning','description','element','finding','recommendation','verification_status','confidence'];
  const keys=[...preferred.filter(k=>Object.prototype.hasOwnProperty.call(obj,k)),...Object.keys(obj).filter(k=>!preferred.includes(k))];
  const rows=[];
  for(const k of keys){
    const v=obj[k];
    if(v===null||v===undefined||v===''||(Array.isArray(v)&&!v.length)) continue;
    let text='';
    if(Array.isArray(v)) text=v.map(x=>typeof x==='object'?Object.values(x).filter(y=>typeof y!=='object').join(' · '):String(x)).join('; ');
    else if(typeof v==='object') text=Object.entries(v).map(([a,b])=>`${a}: ${typeof b==='object'?'[data]':b}`).join(' · ');
    else text=String(v);
    rows.push(`<div class="k">${escapeHtml(k.replaceAll('_',' '))}</div><div class="v">${escapeHtml(text)}</div>`);
  }
  return `<div class="review-entry"><b>${index?`Item ${index}`:'Detail'}</b><div class="review-kv">${rows.join('')}</div></div>`;
}
function reviewSection(title,value){
  let body='';
  if(Array.isArray(value)) body=value.length?`<div class="review-list">${value.map((v,i)=>typeof v==='object'?reviewObjectCard(v,i+1):`<div class="review-entry">${escapeHtml(String(v))}</div>`).join('')}</div>`:'<div class="review-empty">Tidak ada data.</div>';
  else if(value&&typeof value==='object') body=reviewObjectCard(value);
  else body=`<div class="review-entry">${escapeHtml(reviewScalar(value))}</div>`;
  return `<section class="review-section"><h4>${escapeHtml(title)}</h4>${body}</section>`;
}
function reviewText(value){
  if(value===null||value===undefined||value==='') return '-';
  if(Array.isArray(value)) return value.length?value.map((x,i)=>`${i+1}. ${typeof x==='object'?JSON.stringify(x,null,2):x}`).join('\n'):'-';
  if(typeof value==='object') return JSON.stringify(value,null,2);
  return String(value);
}
function openReviewModal(title,body){reviewModalTitle.textContent=title||'Review Riwayat';reviewModalBody.textContent=body||'-';reviewModal.classList.add('open');reviewModal.setAttribute('aria-hidden','false')}
function closeReviewModal(){reviewModal.classList.remove('open');reviewModal.setAttribute('aria-hidden','true')}
reviewModal.addEventListener('click',e=>{if(e.target===reviewModal)closeReviewModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&reviewModal.classList.contains('open'))closeReviewModal()});
async function fetchHistory(kind,id){return (await json(`${API}/history/${kind}/${id}`)).data}
async function reviewHistory(kind,id){
  try{
    const x=await fetchHistory(kind,id);
    if(kind==='drafts'){
      currentDraftId=x.id;await selectDraftTemplateFromRecord(x);party1.value=x.party1||'';party2.value=x.party2||'';effectiveDate.value=x.effective_date||'';duration.value=x.duration||12;prompt.value=x.prompt||'';draftPreview.textContent=x.content||'';activatePanel('draft');toast('Draft dimuat untuk review/edit');return;
    }
    if(kind==='contract_reviews'){
      reviewResult.innerHTML=formatContractReview(x);activatePanel('review');toast('Riwayat review dibuka');return;
    }
    if(kind==='research_notes'){
      rTitle.value=x.title||'';rJur.value=x.jurisdiction||'Indonesia';rCitation.value=x.citation||'';if([...rType.options].some(o=>o.value===x.source_type))rType.value=x.source_type;rText.value=x.source_text||x.content||'';researchResult.textContent=renderResearchSummary(x);activatePanel('research');toast('Research note dibuka');return;
    }
    if(kind==='risk_assessments'){
      riskEntity.value=x.entity||'';riskCategory.value=x.category||riskCategory.value;if(Array.isArray(x.custom_controls))saveCustomRiskControls(riskCategory.value,x.custom_controls);await loadRiskQuestions();Object.entries(x.answers||{}).forEach(([k,v])=>{const el=document.querySelector(`[data-risk="${CSS.escape(k)}"]`);if(el)el.value=v});riskResult.innerHTML=renderRiskProfileDashboard(x);activatePanel('risk');toast('Assessment dibuka');return;
    }
    if(kind==='case_analyses'){
      currentCaseAnalysis=x; caseExportPdf.disabled=false; caseExportDocx.disabled=false; caseToDraftBtn.disabled=false; caseToComplianceBtn.disabled=false; renderCaseReadiness(x.analysis_readiness||x.case_readiness);
      caseTitle.value=x.title||'';
      caseClientId.value=x.client_id||'';
      caseClientName.value=x.client_name||'';
      caseNarrative.value=x.input_type==='narrative'?(x.source_text||''):'';
      caseFile.value='';
      caseMeta.textContent=`Review tersimpan • ${x.input_type||'-'}${x.filename?' • '+x.filename:''} • ${x.created_at||''}`;
      renderCaseWorkingPaper(x);
      renderOfficialVerification(x.official_verification||null,x.case_regulatory_snapshot||null);
      renderCaseRelatedRecords(x.id);
      const sourceTab=document.querySelector('#case .case-tab'); if(sourceTab)caseTab('source',sourceTab);
      syncCaseProcessStrip();
      activatePanel('case');
      requestAnimationFrame(()=>{document.getElementById('caseMeta')?.scrollIntoView({behavior:'smooth',block:'start'});});
      toast('Case Analysis tersimpan dibuka untuk review');return;
    }
    if(kind==='client_documents'){
      cClientId.value=x.client_id||'';cName.value=x.client_name||'';cEmail.value=x.client_email||'';cWhatsapp.value=x.whatsapp_number||'';cAddress.value=x.client_address||'';cMatter.value=x.matter||x.case_ref||'';cCaseId.value=x.case_id||'';if(String(x.document_type||'').startsWith('legal_service_')){cType.value='legal_service';cServiceType.value=x.document_type==='legal_service_representation_request'?'representation_request':'consultation';}else if([...cType.options].some(o=>o.value===x.document_type))cType.value=x.document_type;updateClientServiceMode();cSubject.value=x.subject||'';cMessage.value=x.message||'';currentClientDocumentId=x.id||null;clientDraftSaved=true;activatePanel('client');requestAnimationFrame(()=>{lexicoreSectionShow('client',2);clientSetFlowStatus(3,'Dokumen tersimpan dibuka untuk review atau pengiriman ulang.');const s=document.getElementById('clientDocumentState');if(s)s.textContent='Dokumen tersimpan dibuka dari riwayat.';});if(x.case_id)loadClientCaseDocuments();toast('Dokumen klien dibuka');return;
    }
    openReviewModal('Review Riwayat',Object.entries(x).map(([k,v])=>`${k.toUpperCase()}\n${reviewText(v)}`).join('\n\n'));
  }catch(e){toast(e.message)}
}
async function deleteHistoryItem(kind,id,label){if(!confirm(`Hapus ${label||'riwayat ini'}? Tindakan ini tidak dapat dibatalkan.`))return;try{await json(`${API}/history/${kind}/${id}`,{method:'DELETE'});if(kind==='drafts'&&currentDraftId===id){currentDraftId=null;draftPreview.textContent='Draft akan muncul di sini.'}if(kind==='client_documents'&&currentClientDocumentId===id){currentClientDocumentId=null;clientDraftSaved=false}toast('Riwayat dihapus');await loadAll()}catch(e){toast(e.message)}}
async function clearHistory(kind,label){if(!confirm(`Hapus ${label||'seluruh riwayat'}? Tindakan ini tidak dapat dibatalkan.`))return;try{const d=await json(`${API}/history/${kind}`,{method:'DELETE'});if(kind==='drafts'){currentDraftId=null;draftPreview.textContent='Draft akan muncul di sini.'}if(kind==='case_analyses'){currentCaseAnalysis=null;caseExportPdf.disabled=true;caseExportDocx.disabled=true;caseToDraftBtn.disabled=true;caseToComplianceBtn.disabled=true;caseRelatedRecords.innerHTML=''}if(kind==='client_documents'){currentClientDocumentId=null;clientDraftSaved=false}toast(`${d.deleted||0} record dihapus`);await loadAll()}catch(e){toast(e.message)}}
async function purgeAllHistory(){if(!confirm('Hapus SEMUA draft dan seluruh riwayat kerja tersimpan? Regulatory Corpus tetap dipertahankan. Tindakan ini tidak dapat dibatalkan.'))return;if(!confirm('Konfirmasi terakhir: benar-benar bersihkan seluruh riwayat kerja LexiCore?'))return;try{await json(`${API}/history`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:'HAPUS SEMUA RIWAYAT'})});currentDraftId=null;currentClientDocumentId=null;clientDraftSaved=false;currentCaseAnalysis=null;draftPreview.textContent='Draft akan muncul di sini.';caseExportPdf.disabled=true;caseExportDocx.disabled=true;caseToDraftBtn.disabled=true;caseToComplianceBtn.disabled=true;caseRelatedRecords.innerHTML='';toast('Seluruh riwayat kerja telah dibersihkan');await loadAll()}catch(e){toast(e.message)}}
async function loadAll(){try{let [metrics,d,a,r,k,ca,c]=await Promise.all([json(API+'/dashboard/metrics'),json(API+'/drafts?limit=8'),json(API+'/analyses?limit=8'),json(API+'/research?limit=8'),json(API+'/compliance?limit=8'),json(API+'/case-analysis?limit=8'),json(API+'/communications?limit=8')]);const m=metrics.metrics||{};mDraft.textContent=m.drafts??0;mReview.textContent=m.contract_reviews??0;mCorpus.textContent=m.regulatory_corpus??0;mResearch.textContent=m.research_notes??0;mRisk.textContent=m.risk_assessments??0;mCase.textContent=m.case_analyses??0;mNorm.textContent=m.norm_conflict_analyses??0;mClient.textContent=m.client_documents??0;draftHistory.innerHTML=items(d.data,x=>`<div class="item"><b>${escapeHtml(x.title)}</b><br><small>${escapeHtml(x.doc_type||'')} • ${escapeHtml(x.created_at||'')}</small><div class="item-actions"><button class="btn xs soft" onclick="reviewHistory('drafts',${x.id})">Review</button><button class="btn xs danger-outline" onclick="deleteHistoryItem('drafts',${x.id},'draft ini')">Hapus</button></div></div>`);reviewHistory.innerHTML=items(a.data,x=>`<div class="item"><b>${escapeHtml(x.filename||'Review')}</b> <span class="badge">${escapeHtml(x.risk_score||'LOW')}</span><br><small>${x.word_count||0} kata • ${(x.risks||[]).length} risiko</small><div class="item-actions"><button class="btn xs soft" onclick="reviewHistory('contract_reviews',${x.id})">Review</button><button class="btn xs danger-outline" onclick="deleteHistoryItem('contract_reviews',${x.id},'review ini')">Hapus</button></div></div>`);researchHistory.innerHTML=items(r.data,x=>`<div class="item"><b>${escapeHtml(x.title||'Research')}</b><br><small>${escapeHtml(x.citation||x.jurisdiction||'')} • ${escapeHtml((x.keywords||[]).join(', '))}</small><div class="item-actions"><button class="btn xs soft" onclick="reviewHistory('research_notes',${x.id})">Review</button><button class="btn xs danger-outline" onclick="deleteHistoryItem('research_notes',${x.id},'research note ini')">Hapus</button></div></div>`);riskHistory.innerHTML=items(k.data,x=>`<div class="item"><b>${escapeHtml(x.entity||x.title||'Assessment')}</b> <span class="badge">${escapeHtml(x.risk_level||'-')}</span><br><small>Score ${x.score??'-'}/100 • ${escapeHtml(x.category||'')}</small><div class="item-actions"><button class="btn xs soft" onclick="reviewHistory('risk_assessments',${x.id})">Review</button><button class="btn xs danger-outline" onclick="deleteHistoryItem('risk_assessments',${x.id},'assessment ini')">Hapus</button></div></div>`);caseHistory.innerHTML=items(ca.data,x=>`<div class="item"><b>${escapeHtml(x.title||'Case Analysis')}</b><br><small>${escapeHtml(x.input_type||'narrative')}${x.filename?' • '+escapeHtml(x.filename):''} • ${escapeHtml(x.created_at||'')}</small><div class="item-actions"><button class="btn xs soft" onclick="reviewHistory('case_analyses',${x.id})">Review</button><button class="btn xs danger-outline" onclick="deleteHistoryItem('case_analyses',${x.id},'Case Analysis ini')">Hapus</button></div></div>`);clientHistory.innerHTML=items(c.data,x=>`<div class="item"><b>${escapeHtml(x.subject||'Client document')}</b><br><small>${escapeHtml(x.client_id||'-')} • ${escapeHtml(x.client_name||'-')} • ${escapeHtml(x.legal_position||'kedudukan belum diisi')} • ${escapeHtml(x.whatsapp_number||'WA belum terdaftar')} • ${escapeHtml(x.document_type||'')}</small><div class="item-actions"><button class="btn xs soft" onclick="reviewHistory('client_documents',${x.id})">Review</button><button class="btn xs danger-outline" onclick="deleteHistoryItem('client_documents',${x.id},'dokumen ini')">Hapus</button></div></div>`);
    if(typeof cCaseId!=='undefined'&&cCaseId){const keep=cCaseId.value;cCaseId.innerHTML='<option value="">— Tidak dikaitkan —</option>'+(ca.data||[]).map(x=>`<option value="${x.id}">#${x.id} — ${escapeHtml(x.title||'Case Analysis')}</option>`).join('');cCaseId.value=keep}
    refreshClientIdOptions();
  }catch(e){console.error(e)}}
json(API+'/health').then(x=>{serverStatus.textContent='● API online • v'+x.version;const sv=document.getElementById('sideVersion');if(sv)sv.textContent='LexiCore v'+x.version}).catch(()=>{serverStatus.textContent='● API offline';serverStatus.style.color='#b64040'});
const scheduleInitialWorkspaceLoad=()=>loadAll();
if('requestIdleCallback' in window)window.requestIdleCallback(scheduleInitialWorkspaceLoad,{timeout:1200});else setTimeout(scheduleInitialWorkspaceLoad,80);


/* v1.3.13.8 UI corrective: split every menu into short, focused sections. */
(function(){
  const labels={
    draft:['Persiapan Draft','Detail & Instruksi','Document Preview','Draft Terbaru'],
    review:['Unggah Kontrak','Analisis','Review Result','Riwayat Review'],
    corpus:['Parameter Pencarian','Mode & Aksi','Regulatory Intelligence'],
    research:['Identitas Sumber','Query & Materi','Research Note','Research Library'],
    risk:['Entitas & Kategori','Kontrol / Pertanyaan','Risk Profile','Riwayat Assessment'],
    case:['Input Perkara','Mode & Analisis','Working Paper','Riwayat Case'],
    norm:['Aturan yang Dibandingkan','Konteks Pertentangan','Conflict Working Paper'],
    client:['Identitas & Matter','Status, Dokumen & Tenggat','Client Document','Riwayat Komunikasi']
  };
  const states={};
  function chunkBuilder(card,count){
    if(!card) return [];
    const children=[...card.children];
    const heading=children.find(x=>/^H[1-4]$/.test(x.tagName));
    const keep=[]; const movable=[];
    children.forEach((el,idx)=>{
      if(el===heading) return;
      if(idx<=2 && (el.classList.contains('muted')||el.classList.contains('hint')||el.classList.contains('contract-review-note'))) keep.push(el);
      else movable.push(el);
    });
    if(count<2 || movable.length<2) return [card];
    keep.forEach(el=>{ if(el.parentNode===card) card.insertBefore(el, heading?heading.nextSibling:card.firstChild); });
    const midpoint=Math.max(1,Math.ceil(movable.length/2));
    const groups=[movable.slice(0,midpoint),movable.slice(midpoint)];
    return groups.map((els,i)=>{
      const wrap=document.createElement('div');
      wrap.className='panel-input-fragment'+(i===0?' active':'');
      els.forEach(el=>wrap.appendChild(el));
      card.appendChild(wrap);
      return wrap;
    });
  }
  function setupPanel(panel){
    if(!panel || panel.dataset.sectionPager==='1') return;
    const grid=panel.querySelector(':scope > .grid2');
    if(!grid) return;
    const cards=[...grid.children].filter(x=>x.classList&&x.classList.contains('card'));
    if(!cards.length) return;
    const builder=cards[0], result=cards[1]||null;
    const history=[...panel.children].find(x=>x.classList&&x.classList.contains('card')&&x!==builder&&x!==result)||null;
    builder.classList.add('section-builder-card');
    if(result) result.classList.add('section-result-card');
    if(history) history.classList.add('section-history-card');
    const want=(labels[panel.id]||[]).length;
    const explicitClientSteps=panel.id==='client'?[...builder.querySelectorAll(':scope > .client-step-block')]:[];
    const fragments=explicitClientSteps.length?explicitClientSteps:chunkBuilder(builder,want>=4?2:2);
    const sections=[];
    if(fragments.length>1){ sections.push({type:'input',fragment:0}); sections.push({type:'input',fragment:1}); }
    else sections.push({type:'input',fragment:0});
    if(result) sections.push({type:'result'});
    if(history) sections.push({type:'history'});
    const names=labels[panel.id]||sections.map((_,i)=>'Bagian '+(i+1));
    const nav=document.createElement('div'); nav.className='panel-section-nav'; nav.setAttribute('aria-label','Navigasi bagian halaman'); nav.dataset.panelOwner=panel.id;
    sections.forEach((sec,i)=>{
      const b=document.createElement('button'); b.type='button'; b.className='panel-section-btn'+(i===0?' active':'');
      b.textContent=(i+1)+'. '+(names[i]||('Bagian '+(i+1)));
      b.onclick=()=>{if(panel.id==='client'&&window.clientNavigateSection){window.clientNavigateSection(i);return;}showSection(panel,i);}; nav.appendChild(b);
    });
    const host=document.getElementById('workspaceSubnavHost');
    if(host) host.appendChild(nav); else panel.insertBefore(nav,grid);
    panel.classList.add('sectional-mode'); panel.dataset.sectionPager='1';
    states[panel.id]={grid,builder,result,history,fragments,sections,nav,index:0};
    showSection(panel,0,false);
    syncWorkspaceSubnav();
  }
  function showSection(panel,index,scroll=true){
    const st=states[panel.id]; if(!st) return;
    index=Math.max(0,Math.min(index,st.sections.length-1)); st.index=index;
    const sec=st.sections[index];
    st.builder.style.display=sec.type==='input'?'block':'none';
    if(st.result) st.result.style.display=sec.type==='result'?'block':'none';
    if(st.history) st.history.style.display=sec.type==='history'?'block':'none';
    st.fragments.forEach((f,i)=>{ if(f!==st.builder) f.classList.toggle('active',sec.type==='input'&&i===(sec.fragment||0)); });
    st.nav.querySelectorAll('.panel-section-btn').forEach((b,i)=>b.classList.toggle('active',i===index));
    requestAnimationFrame(syncFrozenHeaderHeight);
    if(scroll){ const top=panel.getBoundingClientRect().top+window.scrollY-8; window.scrollTo({top,behavior:'smooth'}); }
  }
  window.lexicoreSectionNext=function(panelId,delta){ const p=document.getElementById(panelId), st=states[panelId]; if(p&&st) showSection(p,st.index+delta); };
  window.lexicoreSectionShow=function(panelId,index){ const p=document.getElementById(panelId), st=states[panelId]; if(p&&st) showSection(p,index); };
  document.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('.panel').forEach(setupPanel));
  if(document.readyState!=='loading') document.querySelectorAll('.panel').forEach(setupPanel);
})();

/* ---- LexiCore inline block boundary ---- */

(function(){
  function setContractFileName(){
    const input=document.getElementById('contractFile'), out=document.getElementById('contractFileName');
    if(out) out.textContent=input&&input.files&&input.files[0] ? 'File dipilih: '+input.files[0].name : '';
  }
  function setupDropzone(){
    const dz=document.getElementById('contractDropzone'), input=document.getElementById('contractFile');
    if(!dz||!input||dz.dataset.ready==='1') return; dz.dataset.ready='1';
    input.addEventListener('change',setContractFileName);
    ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('dragover')}));
    ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('dragover')}));
    dz.addEventListener('drop',e=>{
      const files=e.dataTransfer&&e.dataTransfer.files; if(!files||!files.length) return;
      try{const dt=new DataTransfer();[...files].forEach(f=>dt.items.add(f));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}catch(_){ }
    });
  }
  const init=()=>{setupDropzone()};
  document.addEventListener('DOMContentLoaded',init); if(document.readyState!=='loading') init();
})();

renderCustomRiskOptionEditor();

/* ---- LexiCore inline block boundary ---- */

(function(){
  const bind=()=>{const rail=document.querySelector('.case-workrail');if(!rail||rail.dataset.wheelX==='1')return;rail.dataset.wheelX='1';rail.addEventListener('wheel',ev=>{if(rail.scrollWidth<=rail.clientWidth+2||Math.abs(ev.deltaX)>=Math.abs(ev.deltaY))return;rail.scrollLeft+=ev.deltaY;ev.preventDefault();},{passive:false});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
