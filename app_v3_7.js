
const WOWS_API = "https://wiki.worldofwarships.com/api.php"; // 旧方式の互換用
const KANCOLLE_API = "https://en.kancollewiki.net/w/api.php"; // 旧方式の互換用

const KANCOLLE_MASTER_URL =
  "https://raw.githubusercontent.com/Nishisonic/gkcoi/master/static/START2.json";
const KANCOLLE_IMAGE_BASE =
  "https://raw.githubusercontent.com/Nishisonic/gkcoi/master/static/ship/card";
const KANCOLLE_SOURCE_URL =
  "https://github.com/Nishisonic/gkcoi";

const WOWS_DATA_URL =
  "https://raw.githubusercontent.com/wowsinfo/data/master/live/app/data/wowsinfo.json";
const WOWS_LANG_URL =
  "https://raw.githubusercontent.com/wowsinfo/data/master/live/app/lang/lang.json";
const WOWS_IMAGE_BASE =
  "https://raw.githubusercontent.com/wowsinfo/data/master/live/app/assets/ships";
const WOWS_SOURCE_URL =
  "https://github.com/wowsinfo/data";

const WOWS_OFFICIAL_API =
  "https://api.worldofwarships.asia/wows/encyclopedia/ships/";

let wowsHdImages = {};
const WOWS_LOCAL_MEDIUM_BASE = "./wows_images/medium";
const wowsLocalMediumCache = {};
const WOWS_NATIONS = [
  "U.S.A.","Japan","U.K.","Germany","U.S.S.R.","France","Italy",
  "Pan-Asia","Europe","Commonwealth","Pan-America","Netherlands","Spain","Poland"
];

let realShips = [];
let kancolleFallback = [];
let modeData = { real: [], kancolle: [], wows: [] };
let activePool = [];
let questions = [];
let endlessQueue = [];
let currentIndex = 0;
let correctCount = 0;
let selectedCount = 10;
let endless = false;
let currentMode = "real";
let currentAnswerMode = "choice";
let lastSettings = null;
let answered = false;

const $ = id => document.getElementById(id);
const screens = ["home","quiz","result"];

function showScreen(id){
  screens.forEach(s => $(s).classList.toggle("active", s === id));
  window.scrollTo({top:0,behavior:"smooth"});
}

function shuffled(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function normalizeAnswer(s){
  return (s||"").normalize("NFKC").toLowerCase()
    .replace(/[　\s・･_\-‐‑–—'’"“”.,，。()（）\[\]【】]/g,"");
}

function acceptedAnswer(input, ship){
  const n=normalizeAnswer(input);
  if(!n) return false;
  const aliases = ship.aliases || [ship.name];
  return aliases.some(a=>normalizeAnswer(a)===n);
}

function historyKey(){
  let filter = "";
  if(currentMode==="real") filter = `${$("eraFilter").value}:${$("countryFilter").value}`;
  if(currentMode==="kancolle") filter = $("kancolleVariant").value;
  if(currentMode==="wows") filter = $("wowsNation").value;
  return `warshipQuizV3Seen:${currentMode}:${filter}`;
}

function buildNoRepeat(pool,count){
  let seen=[];
  try{ seen=JSON.parse(localStorage.getItem(historyKey())||"[]"); }catch{}
  const poolNames=new Set(pool.map(x=>x.id||x.name));
  seen=seen.filter(x=>poolNames.has(x));
  if(seen.length>=pool.length) seen=[];

  const unseen=shuffled(pool.filter(x=>!seen.includes(x.id||x.name)));
  const seenItems=shuffled(pool.filter(x=>seen.includes(x.id||x.name)));
  let result=[...unseen,...seenItems];

  // count が母数を超える場合は新しい周回を追加。
  while(result.length<count){
    const extra=shuffled(pool);
    if(result.length && extra.length>1 && (extra[0].id||extra[0].name)===(result[result.length-1].id||result[result.length-1].name)){
      [extra[0],extra[1]]=[extra[1],extra[0]];
    }
    result=result.concat(extra);
  }
  result=result.slice(0,count);

  let nextSeen=[...seen];
  for(const item of result){
    const id=item.id||item.name;
    if(!nextSeen.includes(id)) nextSeen.push(id);
    if(nextSeen.length>=pool.length) nextSeen=[];
  }
  try{ localStorage.setItem(historyKey(),JSON.stringify(nextSeen)); }catch{}
  return result;
}

async function init(){
  [realShips,kancolleFallback] = await Promise.all([
    fetch("ships.json").then(r=>r.json()),
    fetch("kancolle_fallback.json").then(r=>r.json())
  ]);

  modeData.real = realShips.map((s,i)=>({
    ...s,id:`real:${i}:${s.name}`,mode:"real",
    displayName:s.name,aliases:[s.name],
    meta:`${s.country} ｜ ${s.class} ｜ ${s.type} ｜ 就役 ${s.year}年`
  }));

  const countries=[...new Set(realShips.map(s=>s.country))].sort((a,b)=>a.localeCompare(b,"ja"));
  for(const c of countries){
    const o=document.createElement("option");o.value=c;o.textContent=c;$("countryFilter").appendChild(o);
  }
  for(const n of WOWS_NATIONS){
    const o=document.createElement("option");o.value=n;o.textContent=n;$("wowsNation").appendChild(o);
  }

  $("quizMode").addEventListener("change",onModeChange);
  $("answerMode").addEventListener("change",()=>{});

  const savedApiId=localStorage.getItem("warshipQuiz:wowsApiId")||"";
  if($("wowsApiId")) $("wowsApiId").value=savedApiId;
  const savedQuality=localStorage.getItem("warshipQuiz:wowsImageQuality")||"standard";
  if($("wowsImageQuality")) $("wowsImageQuality").value=savedQuality;

  $("wowsApiId")?.addEventListener("change",()=>{
    localStorage.setItem("warshipQuiz:wowsApiId",$("wowsApiId").value.trim());
  });
  $("wowsImageQuality")?.addEventListener("change",()=>{
    localStorage.setItem("warshipQuiz:wowsImageQuality",$("wowsImageQuality").value);
  });
  $("startBtn").onclick=startQuiz;
  $("quitBtn").onclick=()=>showScreen("home");
  $("nextBtn").onclick=nextQuestion;
  $("textAnswerForm").addEventListener("submit",submitTextAnswer);
  $("revealBtn").onclick=()=>finishAnswer(false,true);
  $("retryBtn").onclick=()=>{ restoreSettings(); startQuiz(); };
  $("homeBtn").onclick=()=>showScreen("home");

  onModeChange();
}

function setStatus(text,busy=false){
  $("dataStatus").textContent=text;
  $("startBtn").disabled=busy;
}

async function onModeChange(){
  const mode=$("quizMode").value;
  $("realFilters").classList.toggle("hidden",mode!=="real");
  $("kancolleFilters").classList.toggle("hidden",mode!=="kancolle");
  $("wowsFilters").classList.toggle("hidden",mode!=="wows");

  if(mode==="real"){
    setStatus(`実在艦艇 ${modeData.real.length}隻を使用`);
  }else if(mode==="kancolle"){
    if(modeData.kancolle.length){
      setStatus(`艦これ ${modeData.kancolle.length}形態を使用可能`);
    }else{
      setStatus("艦これデータはクイズ開始時に読み込みます");
    }
  }else{
    if(modeData.wows.length){
      setStatus(`WoWS ${modeData.wows.length}隻を使用可能`);
    }else{
      setStatus("WoWSは標準 / medium画像 / 公式HD画像を選べます。medium画像はゲーム本体から取り出して使えます");
    }
  }
}

function cacheGet(key,maxAgeMs){
  try{
    const x=JSON.parse(localStorage.getItem(key)||"null");
    if(x && Date.now()-x.time<maxAgeMs) return x.data;
  }catch{}
  return null;
}
function cacheSet(key,data){
  try{localStorage.setItem(key,JSON.stringify({time:Date.now(),data}));}catch{}
}

async function loadKancolleData(){
  if(modeData.kancolle.length) return modeData.kancolle;

  const cached=cacheGet("warshipQuizV33:kancolle",7*24*3600*1000);
  if(cached?.length){
    modeData.kancolle=cached;
    setStatus(`艦これ ${cached.length}形態を使用可能`);
    return cached;
  }

  setStatus("艦これデータを読み込み中…",true);
  $("startBtn").textContent="読み込み中…";

  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),25000);
    const res=await fetch(KANCOLLE_MASTER_URL,{
      signal:controller.signal,
      cache:"force-cache"
    });
    clearTimeout(timer);
    if(!res.ok) throw new Error(`START2 HTTP ${res.status}`);

    const raw=await res.json();
    const master=raw.api_data || raw;
    const ships=Array.isArray(master.api_mst_ship) ? master.api_mst_ship : [];
    const stypes=Array.isArray(master.api_mst_stype) ? master.api_mst_stype : [];

    if(ships.length<100) throw new Error("艦娘マスターデータが少なすぎます");

    const stypeMap=new Map(
      stypes.map(x=>[Number(x.api_id),x.api_name||`艦種${x.api_id}`])
    );

    const remodelTargets=new Set();
    for(const s of ships){
      const after=Number(s.api_aftershipid);
      if(Number.isFinite(after) && after>0) remodelTargets.add(after);
    }

    const fallbackByName=new Map(kancolleFallback.map(x=>[x.jp,x]));

    const list=ships
      .filter(s=>{
        const id=Number(s.api_id);
        const name=(s.api_name||"").trim();
        return Number.isFinite(id) && id>0 && id<1500 && name && name!=="なし";
      })
      .map(s=>{
        const id=Number(s.api_id);
        const jp=(s.api_name||"").trim();
        const yomi=(s.api_yomi||"").trim();
        const type=stypeMap.get(Number(s.api_stype)) || "艦娘";
        const fallback=fallbackByName.get(jp);
        const aliases=[jp];
        if(yomi && yomi!==jp) aliases.push(yomi);
        if(fallback?.en) aliases.push(fallback.en);

        return {
          id:`kc:${id}`,
          mode:"kancolle",
          kcId:id,
          jp,
          en:fallback?.en||"",
          name:jp,
          displayName:jp,
          aliases:[...new Set(aliases.filter(Boolean))],
          type,
          isBase:!remodelTargets.has(id),
          imageUrl:`${KANCOLLE_IMAGE_BASE}/${id}.png`,
          source:KANCOLLE_SOURCE_URL,
          meta:`艦これ No.${id} ｜ ${type}`,
          desc:fallback?.en ? `${jp}（${fallback.en}）` : jp
        };
      });

    if(list.length<100) throw new Error("艦これデータの解析に失敗しました");

    modeData.kancolle=list;
    cacheSet("warshipQuizV33:kancolle",list);
    setStatus(`艦これ ${list.length}形態を読み込みました`);
    return list;

  }catch(err){
    console.warn("Kancolle START2 load failed, using fallback",err);

    const fb=kancolleFallback.map((s,i)=>({
      id:`kcf:${i}:${s.en}`,
      mode:"kancolle",
      name:s.jp,
      displayName:s.jp,
      jp:s.jp,
      en:s.en,
      aliases:[s.jp,s.en].filter(Boolean),
      type:s.type,
      isBase:true,
      source:KANCOLLE_SOURCE_URL,
      meta:`艦これ ｜ ${s.type}`,
      desc:`${s.jp}（${s.en}）`
    }));
    modeData.kancolle=fb;
    setStatus(`艦これ内蔵リスト ${fb.length}隻を使用（画像マスター取得に失敗）`);
    return fb;
  }finally{
    $("startBtn").disabled=false;
    $("startBtn").textContent="クイズ開始";
  }
}

function wowsRegionLabel(region){
  const map={
    usa:"U.S.A.",
    japan:"Japan",
    uk:"U.K.",
    germany:"Germany",
    ussr:"U.S.S.R.",
    france:"France",
    italy:"Italy",
    pan_asia:"Pan-Asia",
    europe:"Europe",
    commonwealth:"Commonwealth",
    pan_america:"Pan-America",
    netherlands:"Netherlands",
    spain:"Spain",
    poland:"Poland"
  };
  return map[String(region||"").toLowerCase()] || String(region||"Other");
}

function getWowsLangMap(langRoot, lang){
  if(!langRoot || typeof langRoot!=="object") return {};
  return langRoot[lang] ||
         langRoot.languages?.[lang] ||
         langRoot.lang?.[lang] ||
         {};
}

function collectWowsShipRecords(root){
  // 現行データではshipsがまとまっている場合、それを最優先して高速処理。
  if(root?.ships && typeof root.ships==="object"){
    return Array.isArray(root.ships) ? root.ships : Object.values(root.ships);
  }
  if(root?.data?.ships && typeof root.data.ships==="object"){
    return Array.isArray(root.data.ships) ? root.data.ships : Object.values(root.data.ships);
  }

  // データ構造が将来変わった場合の予備ルート。
  const ships=[];
  const stack=[root];
  const seen=new WeakSet();

  while(stack.length){
    const value=stack.pop();
    if(!value || typeof value!=="object") continue;
    if(seen.has(value)) continue;
    seen.add(value);

    if(!Array.isArray(value)){
      const index=value.index;
      const tier=Number(value.tier);
      const region=value.region;
      const type=value.type;

      if(
        typeof index==="string" &&
        /^P[A-Z]{3}\d{3}$/i.test(index) &&
        Number.isFinite(tier) &&
        tier>=1 && tier<=11 &&
        typeof region==="string" &&
        typeof type==="string"
      ){
        ships.push(value);
        // 艦艇オブジェクトの巨大なmodules/components内まで再走査しない。
        continue;
      }
    }

    if(Array.isArray(value)){
      for(const child of value){
        if(child && typeof child==="object") stack.push(child);
      }
    }else{
      for(const child of Object.values(value)){
        if(child && typeof child==="object") stack.push(child);
      }
    }
  }
  return ships;
}

function parseWowsStaticData(root, langRoot){
  const jaLang=getWowsLangMap(langRoot,"ja");
  const enLang=getWowsLangMap(langRoot,"en");

  const records=collectWowsShipRecords(root);
  const unique=[...new Map(
    records.map(s=>[String(s.index||"").toUpperCase(),s])
  ).values()];

  const result=[];

  for(const s of unique){
    const code=String(s.index||"").toUpperCase();
    if(!/^P[A-Z]{3}\d{3}$/i.test(code)) continue;

    // wowsinfoのnameには実名ではなく "IDS_PJSA011" のような翻訳キーが入る。
    const nameKey=
      (typeof s.name==="string" && s.name.startsWith("IDS_"))
        ? s.name
        : `IDS_${code}`;

    const jaName=(jaLang[nameKey]||"").trim();
    const enName=(enLang[nameKey]||"").trim();

    // 実名を解決できなかった内部データは問題に出さない。
    // これで PJSA011 / PASA108 のようなコードが回答欄に出なくなる。
    if(!jaName && !enName) continue;

    const displayName=jaName || enName;

    const nation=wowsRegionLabel(s.region);
    const jaNation=(jaLang[s.regionID]||"").trim();
    const enNation=(enLang[s.regionID]||"").trim();
    const nationLabel=jaNation || enNation || nation;

    const jaType=(jaLang[s.typeID]||"").trim();
    const enType=(enLang[s.typeID]||"").trim();
    const shipType=jaType || enType || s.type;

    const aliases=[displayName,jaName,enName,code].filter(Boolean);

    result.push({
      id:`wows:${code}`,
      mode:"wows",
      name:displayName,
      displayName,
      jaName,
      enName,
      nation,
      nationLabel,
      region:s.region,
      tier:Number(s.tier),
      shipType,
      index:code,
      aliases:[...new Set(aliases)],
      source:WOWS_SOURCE_URL,
      meta:`World of Warships ｜ ${nationLabel} ｜ Tier ${s.tier} ｜ ${shipType}`,
      desc:jaName && enName && jaName!==enName
        ? `WoWS艦艇：${jaName}（${enName}）`
        : `WoWS艦艇：${displayName}`,
      imageUrl:`${WOWS_IMAGE_BASE}/${code}.png`
    });
  }

  return result;
}

async function loadWowsPoolForQuiz(){
  if(modeData.wows.length){
    const nation=$("wowsNation").value;
    return modeData.wows.filter(s=>nation==="all" || s.nation===nation);
  }

  // v3.5でキャッシュ名を変更。
  // 旧版で保存された「PJSA011」のような誤った名前データを絶対に再利用しない。
  const cached=cacheGet("warshipQuizV35:wowsLocalized",7*24*3600*1000);
  if(cached?.length){
    modeData.wows=cached;
    const nation=$("wowsNation").value;
    const filtered=cached.filter(s=>nation==="all" || s.nation===nation);
    setStatus(`WoWS ${cached.length}隻（実名）を使用可能`);
    return filtered;
  }

  setStatus("WoWS艦艇データと日本語艦名を読み込み中…（初回のみ）",true);
  $("startBtn").textContent="読み込み中…";

  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),60000);

    const [dataRes,langRes]=await Promise.all([
      fetch(WOWS_DATA_URL,{
        signal:controller.signal,
        cache:"force-cache"
      }),
      fetch(WOWS_LANG_URL,{
        signal:controller.signal,
        cache:"force-cache"
      })
    ]);
    clearTimeout(timer);

    if(!dataRes.ok) throw new Error(`WoWS data HTTP ${dataRes.status}`);
    if(!langRes.ok) throw new Error(`WoWS lang HTTP ${langRes.status}`);

    setStatus("WoWSの艦名を日本語化しています…",true);

    const [raw,langRoot]=await Promise.all([
      dataRes.json(),
      langRes.json()
    ]);

    const list=parseWowsStaticData(raw,langRoot);

    if(list.length<200){
      console.warn("WoWS localized list is unexpectedly small",list);
      throw new Error(`WoWSの実名を十分に取得できませんでした（${list.length}隻）`);
    }

    modeData.wows=list;
    cacheSet("warshipQuizV35:wowsLocalized",list);

    const nation=$("wowsNation").value;
    const filtered=list.filter(s=>nation==="all" || s.nation===nation);
    setStatus(`WoWS ${list.length}隻の実名を読み込みました`);
    return filtered;

  }catch(err){
    console.error("WoWS localized data load failed",err);
    throw new Error(
      "WoWSの艦艇名データを取得できませんでした。少し待ってから、もう一度お試しください。"
    );
  }finally{
    $("startBtn").disabled=false;
    $("startBtn").textContent="クイズ開始";
  }
}


async function wowsLocalMediumExists(code){
  code=String(code||"").toUpperCase();
  if(!code) return false;
  if(Object.prototype.hasOwnProperty.call(wowsLocalMediumCache, code)){
    return wowsLocalMediumCache[code];
  }
  const url=`${WOWS_LOCAL_MEDIUM_BASE}/${code}.png`;
  try{
    const res=await fetch(url,{method:"HEAD",cache:"force-cache"});
    wowsLocalMediumCache[code]=res.ok;
    return res.ok;
  }catch{
    wowsLocalMediumCache[code]=false;
    return false;
  }
}

async function loadWowsHdImages(){
  const quality=$("wowsImageQuality")?.value || "standard";
  if(quality!=="hd") return {};

  if(Object.keys(wowsHdImages).length) return wowsHdImages;

  const cached=cacheGet("warshipQuizV36:wowsHdImages",30*24*3600*1000);
  if(cached && Object.keys(cached).length){
    wowsHdImages=cached;
    return cached;
  }

  const appId=($("wowsApiId")?.value||"").trim();
  if(!appId){
    throw new Error(
      "WoWSのHD画像を使うにはWargaming Developerの application_id が必要です。\\n" +
      "画質を「標準」に戻すか、API IDを入力してください。"
    );
  }

  localStorage.setItem("warshipQuiz:wowsApiId",appId);
  setStatus("WoWS公式のHD画像一覧を読み込み中…",true);

  const fields="ship_id_str,images.large,images.medium";
  const fetchPage=async(pageNo)=>{
    const p=new URLSearchParams({
      application_id:appId,
      language:"ja",
      fields,
      limit:"100",
      page_no:String(pageNo)
    });
    const res=await fetch(`${WOWS_OFFICIAL_API}?${p}`);
    if(!res.ok) throw new Error(`Wargaming API HTTP ${res.status}`);
    const data=await res.json();
    if(data.status!=="ok"){
      const msg=data?.error?.message || data?.error?.code || "API error";
      throw new Error(`Wargaming API: ${msg}`);
    }
    return data;
  };

  try{
    const first=await fetchPage(1);
    const total=Math.max(1,Number(first.meta?.page_total||1));
    const pages=[first];

    // API負荷を抑えるため、残りを4ページずつ取得。
    for(let start=2;start<=total;start+=4){
      const jobs=[];
      for(let p=start;p<start+4 && p<=total;p++) jobs.push(fetchPage(p));
      const batch=await Promise.all(jobs);
      pages.push(...batch);
    }

    const map={};
    for(const page of pages){
      for(const ship of Object.values(page.data||{})){
        const code=String(ship?.ship_id_str||"").toUpperCase();
        const url=ship?.images?.large || ship?.images?.medium || "";
        if(code && url) map[code]=url;
      }
    }

    if(Object.keys(map).length<100){
      throw new Error(`HD画像を十分に取得できませんでした（${Object.keys(map).length}隻）`);
    }

    wowsHdImages=map;
    cacheSet("warshipQuizV36:wowsHdImages",map);
    return map;
  }finally{
    $("startBtn").disabled=false;
    $("startBtn").textContent="クイズ開始";
  }
}

async function startQuiz(){
  currentMode=$("quizMode").value;
  currentAnswerMode=$("answerMode").value;
  selectedCount=Number($("questionCount").value);
  endless=selectedCount===999;
  answered=false;

  try{
    if(currentMode==="kancolle") await loadKancolleData();
    if(currentMode==="wows"){
      activePool = await loadWowsPoolForQuiz();
      await loadWowsHdImages();
    }
  }catch(e){
    alert(e.message||String(e)); return;
  }

  if(currentMode==="real"){
    activePool=modeData.real.filter(s=>{
      const country=$("countryFilter").value;
      const era=$("eraFilter").value;
      const countryOk=country==="all"||s.country===country;
      let eraOk=true;
      if(era==="historic") eraOk=s.year<1990;
      if(era==="modern") eraOk=s.year>=1990;
      return countryOk&&eraOk;
    });
  }else if(currentMode==="kancolle"){
    const all=$("kancolleVariant").value==="all";
    activePool=modeData.kancolle.filter(s=>all||s.isBase);
  }else{
    const nation=$("wowsNation").value;
    // WoWSは loadWowsPoolForQuiz() で必要分だけ高速取得済み。
    // 国指定時だけ念のため指定国へ絞る。
    if(nation!=="all"){
      activePool=activePool.filter(s=>s.nation===nation);
    }
  }

  if(activePool.length<4 && currentAnswerMode==="choice"){
    alert("4択を作るには4件以上必要です。フィルターを広げてください。"); return;
  }
  if(!activePool.length){ alert("この条件では問題がありません。"); return; }

  lastSettings={
    mode:currentMode,answer:currentAnswerMode,count:$("questionCount").value,
    era:$("eraFilter").value,country:$("countryFilter").value,
    kc:$("kancolleVariant").value,wows:$("wowsNation").value,
    wowsQuality:$("wowsImageQuality")?.value || "standard"
  };
  currentIndex=0;correctCount=0;
  if(endless) endlessQueue=shuffled(activePool);
  else questions=buildNoRepeat(activePool,selectedCount);

  showScreen("quiz");
  await renderQuestion();
}

function restoreSettings(){
  if(!lastSettings) return;
  $("quizMode").value=lastSettings.mode;$("answerMode").value=lastSettings.answer;
  $("questionCount").value=lastSettings.count;$("eraFilter").value=lastSettings.era;
  $("countryFilter").value=lastSettings.country;$("kancolleVariant").value=lastSettings.kc;
  $("wowsNation").value=lastSettings.wows;
  if($("wowsImageQuality") && lastSettings.wowsQuality){
    $("wowsImageQuality").value=lastSettings.wowsQuality;
  }
  onModeChange();
}

function currentItem(){
  if(endless){
    if(!endlessQueue.length) endlessQueue=shuffled(activePool);
    return endlessQueue[0];
  }
  return questions[currentIndex];
}

function modeLabel(){
  if(currentMode==="real") return "⚓ 実在艦艇";
  if(currentMode==="kancolle") return "🌸 艦これキャラ";
  return "🎮 World of Warships";
}

async function renderQuestion(){
  answered=false;
  $("feedback").classList.add("hidden");
  $("choices").innerHTML="";
  $("textAnswer").value="";
  $("textAnswer").disabled=false;
  $("submitAnswerBtn").disabled=false;
  $("revealBtn").disabled=false;
  const item=currentItem();

  $("progress").textContent=`${currentIndex+1} / ${endless?"∞":selectedCount}`;
  $("score").textContent=`正解 ${correctCount}`;
  $("modeBadge").textContent=`${modeLabel()} ｜ ${currentAnswerMode==="text"?"文字入力":"4択"}`;
  $("questionText").textContent=currentMode==="kancolle" ? "この艦娘は誰でしょう？" : "この艦艇は何でしょう？";

  const textMode=currentAnswerMode==="text";
  $("choices").classList.toggle("hidden",textMode);
  $("textAnswerForm").classList.toggle("hidden",!textMode);

  if(textMode){
    if(currentMode==="kancolle") $("inputHint").textContent="日本語名・英字名のどちらでも正解になります";
    else if(currentMode==="wows") $("inputHint").textContent="日本語名・英語名のどちらでも正解になります";
    else $("inputHint").textContent="日本語の艦名を入力してください";
    setTimeout(()=>$("textAnswer").focus(),100);
  }else{
    const candidates=shuffled(activePool.filter(s=>(s.id||s.name)!==(item.id||item.name))).slice(0,3);
    shuffled([item,...candidates]).forEach(s=>{
      const b=document.createElement("button");
      b.className="choice";b.textContent=choiceLabel(s);b.dataset.id=s.id||s.name;
      b.onclick=()=>finishChoice(s,item,b);
      $("choices").appendChild(b);
    });
  }

  await loadImage(item);
}

function choiceLabel(s){
  if(s.mode==="real") return `${s.flag||""} ${s.displayName}`.trim();
  if(s.mode==="kancolle") return s.displayName;
  return `${s.displayName} 〔${s.nationLabel || s.nation}〕`;
}

function submitTextAnswer(e){
  e.preventDefault();
  if(answered) return;
  const item=currentItem();
  const ok=acceptedAnswer($("textAnswer").value,item);
  finishAnswer(ok,false);
}

function finishChoice(chosen,item,btn){
  if(answered)return;
  const ok=(chosen.id||chosen.name)===(item.id||item.name);
  document.querySelectorAll(".choice").forEach(b=>{
    b.disabled=true;
    if(b.dataset.id===(item.id||item.name)) b.classList.add("correct");
  });
  if(!ok) btn.classList.add("wrong");
  finishAnswer(ok,false,true);
}

function finishAnswer(ok,revealed=false,fromChoice=false){
  if(answered)return;
  answered=true;
  const item=currentItem();
  if(ok) correctCount++;

  $("feedbackMark").textContent = revealed ? "👀 答え" : ok ? "✅ 正解！" : "❌ 不正解";
  $("feedbackMark").style.color = revealed ? "var(--warn)" : ok ? "var(--ok)" : "var(--bad)";
  $("answerName").textContent=answerDisplay(item);
  $("answerMeta").textContent=item.meta||"";
  $("answerDesc").textContent=item.desc||"";
  $("feedback").classList.remove("hidden");
  $("score").textContent=`正解 ${correctCount}`;

  if(currentAnswerMode==="text"){
    $("textAnswer").disabled=true;$("submitAnswerBtn").disabled=true;$("revealBtn").disabled=true;
  }
  $("nextBtn").textContent=(!endless&&currentIndex+1>=selectedCount)?"結果を見る":"次の問題へ";
  $("feedback").scrollIntoView({behavior:"smooth",block:"nearest"});
}

function answerDisplay(item){
  if(item.mode==="real") return `${item.flag||""} ${item.name}`.trim();
  if(item.mode==="kancolle") return `${item.jp||item.name}（${item.en||""}）`;
  return item.name;
}

async function nextQuestion(){
  if(endless){
    endlessQueue.shift();currentIndex++;
  }else{
    currentIndex++;
    if(currentIndex>=selectedCount){showResult();return;}
  }
  window.scrollTo({top:0,behavior:"smooth"});
  await renderQuestion();
}

async function loadImage(item){
  const img=$("shipImage"),loading=$("loading"),fallback=$("imageFallback"),source=$("sourceLink");
  img.style.display="none";fallback.style.display="none";loading.style.display="block";source.style.display="none";img.removeAttribute("src");
  source.href=item.source||"#";
  try{
    let src="";
    if(item.mode==="real"){
      const title=encodeURIComponent(item.wiki);
      const data=await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
      src=data.originalimage?.source||data.thumbnail?.source||"";
      source.href=data.content_urls?.desktop?.page||item.source||`https://en.wikipedia.org/wiki/${title}`;
    }else if(item.mode==="kancolle"){
      src=await kancolleImageUrl(item);
    }else{
      src=await wowsImageUrl(item);
    }
    if(!src) throw new Error("no image");

    const usingWowsHd =
      item.mode==="wows" &&
      ($("wowsImageQuality")?.value==="hd") &&
      !!wowsHdImages[String(item.index||"").toUpperCase()];

    const usingWowsMedium =
      item.mode==="wows" &&
      src.includes("/wows_images/medium/");

    img.classList.toggle("wows-lowres",item.mode==="wows" && !usingWowsHd && !usingWowsMedium);
    img.classList.toggle("wows-medium",usingWowsMedium);
    img.classList.toggle("wows-hd",usingWowsHd);

    await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=src;});
    img.style.display="block";source.style.display="block";
  }catch(err){
    console.warn("image failed",item,err);
    fallback.style.display="block";source.style.display="block";
  }finally{
    loading.style.display="none";
  }
}

async function kancolleImageUrl(item){
  if(item.imageUrl) return item.imageUrl;
  if(item.kcId) return `${KANCOLLE_IMAGE_BASE}/${item.kcId}.png`;
  return "";
}

async function wowsImageUrl(item){
  const code=String(item.index||"").toUpperCase();
  const quality=$("wowsImageQuality")?.value || "standard";

  if(quality==="medium" && code){
    const exists=await wowsLocalMediumExists(code);
    if(exists) return `${WOWS_LOCAL_MEDIUM_BASE}/${code}.png`;
  }

  if(quality==="hd" && code){
    const hd=wowsHdImages[code];
    if(hd) return hd;
  }

  if(item.imageUrl) return item.imageUrl;
  if(code) return `${WOWS_IMAGE_BASE}/${code}.png`;
  return "";
}

function showResult(){
  const rate=Math.round((correctCount/selectedCount)*100);
  $("resultScore").textContent=`${correctCount} / ${selectedCount}`;
  $("resultRate").textContent=`正答率 ${rate}%`;
  let msg="もう一度挑戦して覚えていこう！";
  if(rate>=90)msg="すごい！かなりの識別力です！";
  else if(rate>=70)msg="かなり詳しいです！あと少しで上級者！";
  else if(rate>=50)msg="いい感じです。画像と答えを見ながら覚えていこう！";
  $("resultMessage").textContent=`${modeLabel()}：${msg}`;
  showScreen("result");
}

init().catch(err=>{
  console.error(err);
  alert("アプリの初期化に失敗しました。GitHub Pages または Live Server から起動してください。");
});
