
const WOWS_API = "https://wiki.worldofwarships.com/api.php"; // 旧方式の互換用
const KANCOLLE_API = "https://en.kancollewiki.net/w/api.php"; // 旧方式の互換用

const KANCOLLE_MASTER_URL =
  "https://raw.githubusercontent.com/Nishisonic/gkcoi/master/static/START2.json";
const KANCOLLE_IMAGE_BASE_CARD =
  "https://raw.githubusercontent.com/Nishisonic/gkcoi/master/static/ship/card";
const KANCOLLE_IMAGE_BASE_BANNER =
  "https://raw.githubusercontent.com/Nishisonic/gkcoi/master/static/ship/banner";
const KANCOLLE_SOURCE_URL =
  "https://github.com/Nishisonic/gkcoi";
const KANCOLLE_FULL_SERVER = "w01y.kancolle-server.com";
const KANCOLLE_CG_KEYS = [
  6657,5699,3371,8909,7719,6229,5449,8561,2987,5501,3127,9319,4365,9811,9927,2423,3439,1865,5925,4409,5509,1517,9695,9255,
  5325,3691,5519,6949,5607,9539,4133,7795,5465,2659,6381,6875,4019,9195,5645,2887,1213,1815,8671,3015,3147,2991,7977,7045,
  1619,7909,4451,6573,4545,8251,5983,2849,7249,7449,9477,5963,2711,9019,7375,2201,5631,4893,7653,3719,8819,5839,1853,9843,
  9119,7023,5681,2345,9873,6349,9315,3795,9737,4633,4173,7549,7171,6147,4723,5039,2723,7815,6201,5999,5339,4431,2911,4435,
  3611,4423,9517,3243
];

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

const AZURLANE_DATA_URL =
  "https://raw.githubusercontent.com/iujab/Lycoris-AzurAPI/main/data/ships.json";
const AZURLANE_SOURCE_URL =
  "https://github.com/iujab/Lycoris-AzurAPI";

let wowsHdImages = {};
const WOWS_LOCAL_MEDIUM_BASE = "./wows_images/medium";
const wowsLocalMediumCache = {};
const WOWS_NATIONS = [
  "U.S.A.","Japan","U.K.","Germany","U.S.S.R.","France","Italy",
  "Pan-Asia","Europe","Commonwealth","Pan-America","Netherlands","Spain","Poland"
];

let realShips = [];
let kancolleFallback = [];
let warThunderVersion = "";
let modeData = { real: [], kancolle: [], azurlane: [], wows: [], warthunder: [], guns: [] };
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

let questionTimerSeconds = 30;
let questionTimerRemaining = 30;
let questionTimerHandle = null;

let totalTimerStartedAt = 0;
let totalTimerElapsedMs = 0;
let totalTimerHandle = null;
let totalTimerRunning = false;

const $ = id => document.getElementById(id);
const screens = ["home","quiz","result"];

function stopQuestionTimer(){
  if(questionTimerHandle){
    clearInterval(questionTimerHandle);
    questionTimerHandle=null;
  }
}

function updateTimerDisplay(){
  const panel=$("timerPanel");
  const text=$("timerText");
  const bar=$("timerBar");
  if(!panel || !text || !bar) return;

  if(questionTimerSeconds<=0){
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  text.textContent=String(Math.max(0,questionTimerRemaining));

  const pct=Math.max(0,Math.min(100,(questionTimerRemaining/questionTimerSeconds)*100));
  bar.style.width=`${pct}%`;

  panel.classList.toggle("timer-warning",questionTimerRemaining<=10 && questionTimerRemaining>5);
  panel.classList.toggle("timer-danger",questionTimerRemaining<=5);
}

function timeoutQuestion(){
  if(answered) return;

  if(currentAnswerMode==="choice"){
    const item=currentItem();
    document.querySelectorAll(".choice").forEach(b=>{
      b.disabled=true;
      if(b.dataset.id===(item.id||item.name)){
        b.classList.add("correct");
      }
    });
  }

  finishAnswer(false,false,false,true);
}

function startQuestionTimer(){
  stopQuestionTimer();

  questionTimerSeconds=Number($("questionTimer")?.value || 0);
  questionTimerRemaining=questionTimerSeconds;
  updateTimerDisplay();

  if(questionTimerSeconds<=0) return;

  questionTimerHandle=setInterval(()=>{
    if(answered){
      stopQuestionTimer();
      return;
    }

    questionTimerRemaining--;
    updateTimerDisplay();

    if(questionTimerRemaining<=0){
      stopQuestionTimer();
      timeoutQuestion();
    }
  },1000);
}

function formatElapsedTime(ms){
  const totalSeconds=Math.max(0,Math.floor(ms/1000));
  const hours=Math.floor(totalSeconds/3600);
  const minutes=Math.floor((totalSeconds%3600)/60);
  const seconds=totalSeconds%60;

  if(hours>0){
    return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
  }
  return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}

function getTotalElapsedMs(){
  if(totalTimerRunning && totalTimerStartedAt){
    return totalTimerElapsedMs + (Date.now()-totalTimerStartedAt);
  }
  return totalTimerElapsedMs;
}

function updateTotalTimerDisplay(){
  const elapsed=getTotalElapsedMs();
  const text=formatElapsedTime(elapsed);

  if($("totalTimerText")) $("totalTimerText").textContent=text;
  if($("resultTotalTime")) $("resultTotalTime").textContent=text;
}

function stopTotalTimer(){
  if(totalTimerRunning && totalTimerStartedAt){
    totalTimerElapsedMs += Date.now()-totalTimerStartedAt;
  }
  totalTimerStartedAt=0;
  totalTimerRunning=false;

  if(totalTimerHandle){
    clearInterval(totalTimerHandle);
    totalTimerHandle=null;
  }

  updateTotalTimerDisplay();
}

function resetTotalTimer(){
  if(totalTimerHandle){
    clearInterval(totalTimerHandle);
    totalTimerHandle=null;
  }
  totalTimerStartedAt=0;
  totalTimerElapsedMs=0;
  totalTimerRunning=false;
  updateTotalTimerDisplay();
}

function startTotalTimer(){
  resetTotalTimer();
  totalTimerStartedAt=Date.now();
  totalTimerRunning=true;
  updateTotalTimerDisplay();

  totalTimerHandle=setInterval(()=>{
    updateTotalTimerDisplay();
  },250);
}

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
  if(currentMode==="azurlane") filter = `${$("azurFaction")?.value || "all"}:${$("azurHull")?.value || "all"}`;
  if(currentMode==="wows") filter = $("wowsNation").value;
  if(currentMode==="warthunder") filter = $("wtCategory")?.value || "all";
  if(currentMode==="guns") filter = `${$("gunCategory")?.value || "all"}:${$("gunCountry")?.value || "all"}`;
  return `warshipQuizV41Seen:${currentMode}:${filter}`;
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

function cleanWarThunderText(value){
  if(value==null) return value;
  // War Thunder localization に含まれる国旗・ツリー用の独自アイコン文字を除去
  // ブラウザでは □ のような文字化けに見えるため、表示名・艦種等から取り除く。
  return String(value)
    .replace(/^[\s⋦␗␙␠╍▀▂▃▄▅▱○◍◑☨\uF059]+/u,"")
    .trim();
}

function cleanWarThunderItem(x){
  const originalAliases=Array.isArray(x.aliases) ? x.aliases : [];
  const displayName=cleanWarThunderText(x.displayName || x.name || "");
  const name=cleanWarThunderText(x.name || x.displayName || "");
  const en=cleanWarThunderText(x.en || "");
  const jp=cleanWarThunderText(x.jp || "");
  const type=cleanWarThunderText(x.type || "");

  const aliases=[
    displayName,name,en,jp,
    ...originalAliases.map(cleanWarThunderText)
  ].filter(Boolean);

  return {
    ...x,
    mode:"warthunder",
    displayName,
    name,
    en,
    jp,
    type,
    aliases:[...new Set(aliases)]
  };
}

async function init(){
  const [realData,kcFallback,wtData,gunsData] = await Promise.all([
    fetch("ships.json").then(r=>r.json()),
    fetch("kancolle_fallback.json").then(r=>r.json()),
    fetch("warthunder.json").then(r=>r.json()),
    fetch("guns.json").then(r=>r.json())
  ]);
  realShips=realData;
  kancolleFallback=kcFallback;
  warThunderVersion=wtData.version || "";
  modeData.warthunder=(wtData.items || []).map(cleanWarThunderItem);
  modeData.guns=(gunsData || []).map(x=>({...x,mode:"guns"}));

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

  const gunCategories=[...new Set(modeData.guns.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,"ja"));
  for(const c of gunCategories){
    const o=document.createElement("option");o.value=c;o.textContent=c;$("gunCategory")?.appendChild(o);
  }
  const gunCountries=[...new Set(modeData.guns.map(x=>x.country))].sort((a,b)=>a.localeCompare(b,"ja"));
  for(const c of gunCountries){
    const o=document.createElement("option");o.value=c;o.textContent=c;$("gunCountry")?.appendChild(o);
  }

  $("quizMode").addEventListener("change",onModeChange);
  $("answerMode").addEventListener("change",()=>{});
  $("wtCategory")?.addEventListener("change",onModeChange);
  $("gunCategory")?.addEventListener("change",onModeChange);
  $("gunCountry")?.addEventListener("change",onModeChange);
  $("kancolleImageType")?.addEventListener("change",()=>{ modeData.kancolle=[]; });
  $("azurFaction")?.addEventListener("change",onModeChange);
  $("azurHull")?.addEventListener("change",onModeChange);

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
  $("quitBtn").onclick=()=>{ stopQuestionTimer(); stopTotalTimer(); showScreen("home"); };
  $("nextBtn").onclick=nextQuestion;
  $("textAnswerForm").addEventListener("submit",submitTextAnswer);
  $("revealBtn").onclick=()=>finishAnswer(false,true);
  $("retryBtn").onclick=()=>{ stopQuestionTimer(); resetTotalTimer(); restoreSettings(); startQuiz(); };
  $("homeBtn").onclick=()=>{ stopQuestionTimer(); stopTotalTimer(); showScreen("home"); };

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
  $("azurlaneFilters")?.classList.toggle("hidden",mode!=="azurlane");
  $("wowsFilters").classList.toggle("hidden",mode!=="wows");
  $("warthunderFilters")?.classList.toggle("hidden",mode!=="warthunder");
  $("gunsFilters")?.classList.toggle("hidden",mode!=="guns");

  if(mode==="real"){
    setStatus(`実在艦艇 ${modeData.real.length}隻を使用`);
  }else if(mode==="kancolle"){
    if(modeData.kancolle.length){
      setStatus(`艦これ ${modeData.kancolle.length}形態を使用可能`);
    }else{
      setStatus("艦これデータはクイズ開始時に読み込みます");
    }
  }else if(mode==="azurlane"){
    if(modeData.azurlane.length){
      const faction=$("azurFaction")?.value || "all";
      const hull=$("azurHull")?.value || "all";
      const count=modeData.azurlane.filter(x=>
        (faction==="all" || x.nationality===faction) &&
        (hull==="all" || x.hullType===hull)
      ).length;
      setStatus(`アズールレーン ${count.toLocaleString()}キャラを使用`);
    }else{
      setStatus("アズールレーンはクイズ開始時に最新データを読み込みます");
    }
  }else if(mode==="wows"){
    if(modeData.wows.length){
      setStatus(`WoWS ${modeData.wows.length}隻を使用可能`);
    }else{
      setStatus("WoWSは標準 / medium画像 / 公式HD画像を選べます。medium画像はゲーム本体から取り出して使えます");
    }
  }else if(mode==="warthunder"){
    const cat=$("wtCategory")?.value || "all";
    const count=modeData.warthunder.filter(x=>cat==="all"||x.category===cat).length;
    setStatus(`War Thunder ${count.toLocaleString()}兵器（海軍除外）${warThunderVersion?` / data ${warThunderVersion}`:""}`);
  }else if(mode==="guns"){
    const cat=$("gunCategory")?.value || "all";
    const country=$("gunCountry")?.value || "all";
    const count=modeData.guns.filter(x=>(cat==="all"||x.category===cat)&&(country==="all"||x.country===country)).length;
    setStatus(`現代銃 ${count}種類を使用`);
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

function currentKancolleImageBase(){
  const mode=$("kancolleImageType")?.value || "banner";
  return mode==="card" ? KANCOLLE_IMAGE_BASE_CARD : KANCOLLE_IMAGE_BASE_BANNER;
}

function kancolleImageTypeLabel(){
  const mode=$("kancolleImageType")?.value || "banner";
  if(mode==="full") return "高画質フルイラスト";
  if(mode==="card") return "カード";
  return "バナー";
}

function kancolleAssetKey(text){
  return String(text).split("").reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
}

function kancolleAssetCreate(id,type){
  const i=Number(id);
  const keyIndex=(kancolleAssetKey(type)+i*type.length)%100;
  const key=KANCOLLE_CG_KEYS[keyIndex];
  return String(((17*(i+7)*key)%8973)+1000);
}

function kancolleFullImageUrl(id,filename){
  const i=Number(id);
  if(!Number.isFinite(i) || !filename) return "";
  const padded=String(i).padStart(4,"0");
  const token=kancolleAssetCreate(i,"ship_full");
  return `https://${KANCOLLE_FULL_SERVER}/kcs2/resources/ship/full/${padded}_${token}_${filename}.png`;
}

async function loadKancolleData(){
  if(modeData.kancolle.length) return modeData.kancolle;

  const cacheKey=`warshipQuizV38:kancolle:${$("kancolleImageType")?.value || "banner"}`;
  const cached=cacheGet(cacheKey,7*24*3600*1000);
  if(cached?.length){
    modeData.kancolle=cached;
    setStatus(`艦これ ${cached.length}形態を使用可能（${kancolleImageTypeLabel()}画像）`);
    return cached;
  }

  setStatus(`艦これデータを読み込み中…（${kancolleImageTypeLabel()}画像）`,true);
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
    const shipgraphs=Array.isArray(master.api_mst_shipgraph) ? master.api_mst_shipgraph : [];

    if(ships.length<100) throw new Error("艦娘マスターデータが少なすぎます");

    const shipgraphMap=new Map(
      shipgraphs.map(x=>[Number(x.api_id),x])
    );

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

        const imageType=$("kancolleImageType")?.value || "banner";
        const graph=shipgraphMap.get(id);
        const fullUrl=kancolleFullImageUrl(id,graph?.api_filename);

        return {
          id:`kc:${id}`,
          mode:"kancolle",
          kcId:id,
          kcFilename:graph?.api_filename||"",
          jp,
          en:fallback?.en||"",
          name:jp,
          displayName:jp,
          aliases:[...new Set(aliases.filter(Boolean))],
          type,
          isBase:!remodelTargets.has(id),
          imageUrl:imageType==="full" ? fullUrl : `${currentKancolleImageBase()}/${id}.png`,
          fallbackImageUrl:`${KANCOLLE_IMAGE_BASE_BANNER}/${id}.png`,
          source:KANCOLLE_SOURCE_URL,
          meta:`艦これ No.${id} ｜ ${type}`,
          desc:fallback?.en ? `${jp}（${fallback.en}）` : jp
        };
      });

    if(list.length<100) throw new Error("艦これデータの解析に失敗しました");

    modeData.kancolle=list;
    cacheSet(cacheKey,list);
    setStatus(`艦これ ${list.length}形態を読み込みました（${kancolleImageTypeLabel()}画像）`);
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


async function loadAzurLaneData(){
  if(modeData.azurlane.length) return modeData.azurlane;

  const cached=cacheGet("militaryQuizV47:azurlane",24*3600*1000);
  if(cached?.length){
    modeData.azurlane=cached;
    populateAzurFilters(cached);
    setStatus(`アズールレーン ${cached.length.toLocaleString()}キャラを使用可能`);
    return cached;
  }

  setStatus("アズールレーンデータを読み込み中…",true);
  $("startBtn").textContent="読み込み中…";

  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    const res=await fetch(AZURLANE_DATA_URL,{
      signal:controller.signal,
      cache:"force-cache"
    });
    clearTimeout(timer);
    if(!res.ok) throw new Error(`Azur Lane HTTP ${res.status}`);

    const raw=await res.json();
    const values=Object.values(raw || {});
    const list=values.map(x=>{
      const en=(x?.names?.en||"").trim();
      const jp=(x?.names?.jp||"").trim();
      const name=jp || en;
      const firstSkin=Array.isArray(x?.skins) ? x.skins.find(s=>s?.image) : null;
      const imageUrl=firstSkin?.images?.default || firstSkin?.image || x?.thumbnail || "";
      const hullType=x?.hullType || "Unknown";
      const nationality=x?.nationality || "Unknown";
      const rarity=x?.rarity || "";
      const klass=x?.class || "";
      const aliases=[jp,en].filter(Boolean);

      return {
        id:`azl:${x?.id || name}`,
        mode:"azurlane",
        name,
        jp,
        en,
        displayName:name,
        aliases:[...new Set(aliases)],
        hullType,
        nationality,
        rarity,
        class:klass,
        imageUrl,
        source:x?.wikiUrl || AZURLANE_SOURCE_URL,
        meta:`アズールレーン ｜ ${nationality} ｜ ${hullType}${rarity?` ｜ ${rarity}`:""}`,
        desc:`${name}${en && jp && en!==jp?`（${en}）`:""}${klass?` ｜ ${klass}級`:""}`
      };
    }).filter(x=>x.name && x.imageUrl);

    if(list.length<100) throw new Error("アズールレーンの取得件数が少なすぎます");

    modeData.azurlane=list;
    cacheSet("militaryQuizV47:azurlane",list);
    populateAzurFilters(list);
    setStatus(`アズールレーン ${list.length.toLocaleString()}キャラを読み込みました`);
    return list;
  }finally{
    $("startBtn").disabled=false;
    $("startBtn").textContent="クイズ開始";
  }
}

function populateAzurFilters(list){
  const factionSelect=$("azurFaction");
  const hullSelect=$("azurHull");
  if(!factionSelect || !hullSelect) return;

  if(factionSelect.options.length<=1){
    const factions=[...new Set(list.map(x=>x.nationality).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ja"));
    for(const x of factions){
      const o=document.createElement("option");
      o.value=x;o.textContent=x;factionSelect.appendChild(o);
    }
  }

  if(hullSelect.options.length<=1){
    const hulls=[...new Set(list.map(x=>x.hullType).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ja"));
    for(const x of hulls){
      const o=document.createElement("option");
      o.value=x;o.textContent=x;hullSelect.appendChild(o);
    }
  }
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
    if(currentMode==="azurlane") await loadAzurLaneData();
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
  }else if(currentMode==="azurlane"){
    const faction=$("azurFaction")?.value || "all";
    const hull=$("azurHull")?.value || "all";
    activePool=modeData.azurlane.filter(s=>
      (faction==="all" || s.nationality===faction) &&
      (hull==="all" || s.hullType===hull)
    );
  }else if(currentMode==="wows"){
    const nation=$("wowsNation").value;
    if(nation!=="all") activePool=activePool.filter(s=>s.nation===nation);
  }else if(currentMode==="warthunder"){
    const cat=$("wtCategory")?.value || "all";
    activePool=modeData.warthunder.filter(s=>cat==="all"||s.category===cat);
  }else if(currentMode==="guns"){
    const cat=$("gunCategory")?.value || "all";
    const country=$("gunCountry")?.value || "all";
    activePool=modeData.guns.filter(s=>(cat==="all"||s.category===cat)&&(country==="all"||s.country===country));
  }

  if(activePool.length<4 && currentAnswerMode==="choice"){
    alert("4択を作るには4件以上必要です。フィルターを広げてください。"); return;
  }
  if(!activePool.length){ alert("この条件では問題がありません。"); return; }

  lastSettings={
    mode:currentMode,answer:currentAnswerMode,count:$("questionCount").value,
    timer:$("questionTimer")?.value || "30",
    era:$("eraFilter").value,country:$("countryFilter").value,
    kc:$("kancolleVariant").value,kcImg:$("kancolleImageType")?.value || "banner",
    azurFaction:$("azurFaction")?.value || "all",
    azurHull:$("azurHull")?.value || "all",
    wows:$("wowsNation").value,
    wowsQuality:$("wowsImageQuality")?.value || "standard",
    wtCategory:$("wtCategory")?.value || "all",
    gunCategory:$("gunCategory")?.value || "all",
    gunCountry:$("gunCountry")?.value || "all"
  };
  currentIndex=0;correctCount=0;
  if(endless) endlessQueue=shuffled(activePool);
  else questions=buildNoRepeat(activePool,selectedCount);

  startTotalTimer();
  showScreen("quiz");
  await renderQuestion();
}

function restoreSettings(){
  if(!lastSettings) return;
  $("quizMode").value=lastSettings.mode;$("answerMode").value=lastSettings.answer;
  $("questionCount").value=lastSettings.count;
  if($("questionTimer") && lastSettings.timer){
    $("questionTimer").value=lastSettings.timer;
  }
  $("eraFilter").value=lastSettings.era;
  $("countryFilter").value=lastSettings.country;$("kancolleVariant").value=lastSettings.kc;
  if($("kancolleImageType") && lastSettings.kcImg){
    $("kancolleImageType").value=lastSettings.kcImg;
    modeData.kancolle=[];
  }
  if($("azurFaction") && lastSettings.azurFaction) $("azurFaction").value=lastSettings.azurFaction;
  if($("azurHull") && lastSettings.azurHull) $("azurHull").value=lastSettings.azurHull;
  $("wowsNation").value=lastSettings.wows;
  if($("wowsImageQuality") && lastSettings.wowsQuality){
    $("wowsImageQuality").value=lastSettings.wowsQuality;
  }
  if($("wtCategory") && lastSettings.wtCategory) $("wtCategory").value=lastSettings.wtCategory;
  if($("gunCategory") && lastSettings.gunCategory) $("gunCategory").value=lastSettings.gunCategory;
  if($("gunCountry") && lastSettings.gunCountry) $("gunCountry").value=lastSettings.gunCountry;
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
  if(currentMode==="azurlane") return "⚓ アズールレーン";
  if(currentMode==="wows") return "🎮 World of Warships";
  if(currentMode==="warthunder") return "🛡️ War Thunder";
  if(currentMode==="guns") return "🔫 現代銃";
  return "クイズ";
}
async function renderQuestion(){
  stopQuestionTimer();
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
  $("questionText").textContent=
    currentMode==="kancolle" ? "この艦娘は誰でしょう？" :
    currentMode==="azurlane" ? "このKAN-SENは誰でしょう？" :
    currentMode==="warthunder" ? "このWar Thunder兵器は何でしょう？" :
    currentMode==="guns" ? "この銃は何でしょう？" :
    "この艦艇は何でしょう？";

  const textMode=currentAnswerMode==="text";
  $("choices").classList.toggle("hidden",textMode);
  $("textAnswerForm").classList.toggle("hidden",!textMode);

  if(textMode){
    if(currentMode==="kancolle") $("inputHint").textContent="日本語名・英字名のどちらでも正解になります";
    else if(currentMode==="azurlane") $("inputHint").textContent="日本語名・英語名のどちらでも正解になります";
    else if(currentMode==="wows") $("inputHint").textContent="日本語名・英語名のどちらでも正解になります";
    else if(currentMode==="warthunder") $("inputHint").textContent="ゲーム内表記・英語名のどちらでも正解になります";
    else if(currentMode==="guns") $("inputHint").textContent="モデル名を入力してください（記号・空白の違いは無視します）";
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
  startQuestionTimer();
}

function choiceLabel(s){
  if(s.mode==="real") return `${s.flag||""} ${s.displayName}`.trim();
  if(s.mode==="kancolle") return s.displayName;
  if(s.mode==="azurlane") return s.displayName;
  if(s.mode==="wows") return `${s.displayName} 〔${s.nationLabel || s.nation}〕`;
  if(s.mode==="warthunder") return s.displayName;
  if(s.mode==="guns") return s.displayName;
  return s.displayName || s.name;
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

function finishAnswer(ok,revealed=false,fromChoice=false,timedOut=false){
  if(answered)return;
  answered=true;
  stopQuestionTimer();
  const item=currentItem();
  if(ok) correctCount++;

  $("feedbackMark").textContent =
    timedOut ? "⏰ 時間切れ！" :
    revealed ? "👀 答え" :
    ok ? "✅ 正解！" : "❌ 不正解";
  $("feedbackMark").style.color =
    timedOut ? "var(--warn)" :
    revealed ? "var(--warn)" :
    ok ? "var(--ok)" : "var(--bad)";
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
  if(item.mode==="kancolle") return `${item.jp||item.name}${item.en?`（${item.en}）`:""}`;
  if(item.mode==="azurlane") return `${item.jp||item.name}${item.en && item.en!==(item.jp||item.name)?`（${item.en}）`:""}`;
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
  img.classList.remove("wows-lowres","wows-medium","wows-hd","wt-image","gun-image","kancolle-banner-crop","kancolle-card-image","kancolle-full-image","azurlane-image");
  source.href=item.source||"#";
  try{
    let src="";
    if(item.mode==="real" || item.mode==="guns"){
      const title=encodeURIComponent(item.wiki);
      const data=await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
      src=data.originalimage?.source||data.thumbnail?.source||"";
      source.href=data.content_urls?.desktop?.page||item.source||`https://en.wikipedia.org/wiki/${title}`;
    }else if(item.mode==="kancolle"){
      src=await kancolleImageUrl(item);
    }else if(item.mode==="azurlane"){
      src=item.imageUrl||"";
      source.href=item.source||AZURLANE_SOURCE_URL;
    }else if(item.mode==="wows"){
      src=await wowsImageUrl(item);
    }else if(item.mode==="warthunder"){
      src=item.imageUrl||"";
      source.href=item.source||"https://wiki.warthunder.com/";
    }
    if(!src) throw new Error("no image");

    const usingWowsHd =
      item.mode==="wows" &&
      ($("wowsImageQuality")?.value==="hd") &&
      !!wowsHdImages[String(item.index||"").toUpperCase()];

    const usingWowsMedium =
      item.mode==="wows" &&
      src.includes("/wows_images/medium/");

    const kancolleImageType=$("kancolleImageType")?.value || "banner";
    const usingKancolleBanner=item.mode==="kancolle" && kancolleImageType==="banner";
    const usingKancolleFull=item.mode==="kancolle" && kancolleImageType==="full";

    img.classList.toggle("wows-lowres",item.mode==="wows" && !usingWowsHd && !usingWowsMedium);
    img.classList.toggle("wows-medium",usingWowsMedium);
    img.classList.toggle("wows-hd",usingWowsHd);
    img.classList.toggle("wt-image",item.mode==="warthunder");
    img.classList.toggle("gun-image",item.mode==="guns");
    img.classList.toggle("azurlane-image",item.mode==="azurlane");
    img.classList.toggle("kancolle-banner-crop",usingKancolleBanner);
    img.classList.toggle("kancolle-full-image",usingKancolleFull);
    img.classList.toggle("kancolle-card-image",item.mode==="kancolle" && !usingKancolleBanner && !usingKancolleFull);

    await new Promise((res,rej)=>{
      let triedFallback=false;
      img.onload=res;
      img.onerror=()=>{
        if(usingKancolleFull && !triedFallback && item.fallbackImageUrl){
          triedFallback=true;
          img.classList.remove("kancolle-full-image");
          img.classList.add("kancolle-banner-crop");
          img.src=item.fallbackImageUrl;
          return;
        }
        rej(new Error("image load failed"));
      };
      img.src=src;
    });
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

  const mode=$("kancolleImageType")?.value || "banner";
  if(mode==="full" && item.kcId && item.kcFilename){
    return kancolleFullImageUrl(item.kcId,item.kcFilename);
  }
  if(item.kcId) return `${currentKancolleImageBase()}/${item.kcId}.png`;
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
  stopQuestionTimer();
  stopTotalTimer();
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
