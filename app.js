
const WOWS_API = "https://wiki.worldofwarships.com/api.php";
const KANCOLLE_API = "https://en.kancollewiki.net/w/api.php";
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
      setStatus("WoWSは必要な国だけ先に高速取得します。残りはプレイ中に自動取得します");
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
  const cached=cacheGet("warshipQuizV3:kancolle",7*24*3600*1000);
  if(cached?.length){ modeData.kancolle=cached; return cached; }

  setStatus("艦これWikiから艦娘一覧を読み込み中…",true);
  try{
    const url=`${KANCOLLE_API}?action=parse&page=Ship_list&prop=text&format=json&formatversion=2&origin=*`;
    const data=await fetch(url).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
    const doc=new DOMParser().parseFromString(data.parse.text,"text/html");
    const rows=[...doc.querySelectorAll("table.wikitable tr")];
    const list=[];

    for(const tr of rows){
      const td=[...tr.querySelectorAll("td")];
      if(td.length<4) continue;
      const no=(td[0].textContent||"").trim();
      if(!/^\d+$/.test(no)) continue;

      const html=(td[1].innerHTML||"").replace(/<br\s*\/?>/gi,"\n");
      const tmp=document.createElement("div"); tmp.innerHTML=html;
      let lines=(tmp.textContent||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);
      if(lines.length<2){
        // Some table markup collapses line breaks; use anchor text + Japanese text fallback.
        const a=td[1].querySelector("a");
        const en=(a?.textContent||"").trim();
        const full=(td[1].textContent||"").trim();
        let jp=full.replace(en,"").trim();
        if(en && jp) lines=[en,jp];
      }
      if(!lines.length) continue;
      const en=lines[0];
      const jp=lines[1]||en;
      if(!en || !jp) continue;

      const cls=(td[2].textContent||"").replace(/\s+/g," ").trim();
      const typ=(td[3].textContent||"").replace(/\s+/g," ").trim();
      const isBase = !/(Kai|Zwei|Drei|Due|Mk\.?\s?II|Mod\.?\s?2|改|甲|乙|丙|丁)/i.test(`${en} ${jp}`);
      list.push({
        id:`kc:${no}`,mode:"kancolle",no,en,jp,name:jp,displayName:jp,
        aliases:[jp,en],className:cls,type:typ,isBase,
        source:`https://en.kancollewiki.net/${encodeURIComponent(en.replaceAll(" ","_"))}`,
        meta:`艦これ No.${no} ｜ ${typ || "艦娘"}${cls?` ｜ ${cls}`:""}`,
        desc:`${jp}（${en}）`
      });
    }
    const unique=[...new Map(list.map(x=>[x.id,x])).values()];
    if(unique.length<100) throw new Error("parsed too few ships");
    modeData.kancolle=unique;
    cacheSet("warshipQuizV3:kancolle",unique);
    setStatus(`艦これ ${unique.length}形態を読み込みました`);
    return unique;
  }catch(err){
    console.warn("Kancolle live list failed, using fallback",err);
    const fb=kancolleFallback.map((s,i)=>({
      id:`kcf:${i}:${s.en}`,mode:"kancolle",name:s.jp,displayName:s.jp,jp:s.jp,en:s.en,
      aliases:[s.jp,s.en],type:s.type,isBase:true,source:s.source,
      meta:`艦これ ｜ ${s.type}`,desc:`${s.jp}（${s.en}）`
    }));
    modeData.kancolle=fb;
    setStatus(`艦これ内蔵リスト ${fb.length}隻を使用（オンライン一覧の取得に失敗）`);
    return fb;
  }finally{
    $("startBtn").disabled=false;
  }
}

async function fetchCategoryMembers(category){
  let result=[], cont="";
  do{
    const p=new URLSearchParams({
      action:"query",list:"categorymembers",cmtitle:`Category:${category}`,
      cmlimit:"500",cmnamespace:"0",format:"json",origin:"*"
    });
    if(cont) p.set("cmcontinue",cont);
    const data=await fetch(`${WOWS_API}?${p}`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
    result=result.concat(data.query?.categorymembers||[]);
    cont=data.continue?.cmcontinue||"";
  }while(cont);
  return result;
}

async function loadWowsNation(nation, quiet=false){
  const memory = modeData.wows.filter(s=>s.nation===nation);
  if(memory.length) return memory;

  const key=`warshipQuizV32:wows:${nation}`;
  const cached=cacheGet(key,7*24*3600*1000);
  if(cached?.length){
    modeData.wows=[...new Map([...modeData.wows,...cached].map(x=>[x.id,x])).values()];
    return cached;
  }

  if(!quiet) setStatus(`WoWS「${nation}」の艦艇一覧を読み込み中…`,true);

  const members=await fetchCategoryMembers(`Ships of ${nation}`);
  const list=members
    .filter(m=>m.title?.startsWith("Ship:"))
    .map(m=>{
      const name=m.title.slice(5);
      return {
        id:`wows:${nation}:${name}`,mode:"wows",name,displayName:name,nation,
        aliases:[name],pageTitle:m.title,
        source:`https://wiki.worldofwarships.com/${encodeURIComponent(m.title.replaceAll(" ","_"))}`,
        meta:`World of Warships ｜ ${nation}`,
        desc:`WoWS公式Wiki掲載艦艇：${name}`
      };
    });

  if(!list.length) throw new Error(`${nation} の艦艇一覧を取得できませんでした。`);

  cacheSet(key,list);
  modeData.wows=[...new Map([...modeData.wows,...list].map(x=>[x.id,x])).values()];
  return list;
}

function cachedWowsNations(){
  return WOWS_NATIONS.filter(n=>{
    if(modeData.wows.some(s=>s.nation===n)) return true;
    return !!cacheGet(`warshipQuizV32:wows:${n}`,7*24*3600*1000)?.length;
  });
}

async function loadWowsPoolForQuiz(){
  const selected=$("wowsNation").value;

  // 国を指定した場合は、その国だけ1回取得するので非常に速い。
  if(selected!=="all"){
    try{
      const list=await loadWowsNation(selected);
      setStatus(`WoWS ${selected}：${list.length}隻を使用`);
      return list;
    }finally{
      $("startBtn").disabled=false;
      $("startBtn").textContent="クイズ開始";
    }
  }

  // 「すべて」の場合も14か国を一度に読まない。
  // 最初のクイズに必要な分だけ、2～4か国を先に取得して即スタートする。
  const needNations = selectedCount>=30 ? 4 : selectedCount>=20 ? 3 : 2;
  const shuffledNations=shuffled(WOWS_NATIONS);
  const already=cachedWowsNations();
  const ordered=[
    ...shuffled(already),
    ...shuffledNations.filter(n=>!already.includes(n))
  ];
  const target=ordered.slice(0,needNations);

  setStatus(`WoWSを高速読み込み中… 0 / ${target.length}か国`,true);
  $("startBtn").textContent="読み込み中…";

  const loaded=[];
  for(let i=0;i<target.length;i++){
    const nation=target[i];
    try{
      const list=await loadWowsNation(nation,true);
      loaded.push(...list);
      setStatus(`WoWSを高速読み込み中… ${i+1} / ${target.length}か国（${loaded.length}隻）`,true);
    }catch(err){
      console.warn("WoWS nation load failed",nation,err);
    }
  }

  $("startBtn").disabled=false;
  $("startBtn").textContent="クイズ開始";

  if(loaded.length<4){
    throw new Error("WoWSの艦艇一覧を取得できませんでした。ネット接続を確認して、もう一度お試しください。");
  }

  setStatus(`WoWS ${loaded.length}隻で開始します。残りの国はプレイ中にバックグラウンド取得します。`);

  // クイズ開始後に残りをゆっくり取得してキャッシュ。
  // 次回以降は「すべて」でもほぼ待たずに開始できる。
  setTimeout(()=>backgroundLoadRemainingWows(target),1200);
  return loaded;
}

async function backgroundLoadRemainingWows(initialNations=[]){
  const rest=WOWS_NATIONS.filter(n=>!initialNations.includes(n) && !cachedWowsNations().includes(n));
  let done=0;
  for(const nation of rest){
    try{
      await loadWowsNation(nation,true);
      done++;
      // Wikiに短時間で大量アクセスしないため少し間隔を空ける。
      await new Promise(r=>setTimeout(r,350));
    }catch(err){
      console.warn("Background WoWS load failed",nation,err);
    }
  }
  if(done){
    console.log(`WoWS background cache completed: ${done} nations`);
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
    if(currentMode==="wows") activePool = await loadWowsPoolForQuiz();
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
    kc:$("kancolleVariant").value,wows:$("wowsNation").value
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
  $("wowsNation").value=lastSettings.wows;onModeChange();
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
    else if(currentMode==="wows") $("inputHint").textContent="WoWS公式Wiki表記の艦名を入力してください（英字・数字）";
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
  return `${s.displayName} 〔${s.nation}〕`;
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
    await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=src;});
    img.style.display="block";source.style.display="block";
  }catch(err){
    console.warn("image failed",item,err);
    fallback.style.display="block";source.style.display="block";
  }finally{
    loading.style.display="none";
  }
}

function absoluteKancolleUrl(url){
  if(!url) return "";
  if(url.startsWith("//")) return "https:" + url;
  if(url.startsWith("/")) return "https://en.kancollewiki.net" + url;
  return url;
}

async function kancolleImageUrl(item){
  // v3.1:
  // 艦これWikiではカード画像の実ファイル名が艦娘によって
  // "Ship Card Nagato.png" / "Nagato card.jpg" など一定ではないため、
  // ファイル名を推測せず、その艦娘ページのHTMLから実際のカード画像を探す。
  const key=`kcimg:v31:${item.en}`;
  const cached=cacheGet(key,30*24*3600*1000);
  if(cached) return cached;

  const pageName=(item.en || item.name || "").trim();
  if(!pageName) return "";

  try{
    const p=new URLSearchParams({
      action:"parse",
      page:pageName,
      prop:"text",
      format:"json",
      formatversion:"2",
      origin:"*"
    });
    const data=await fetch(`${KANCOLLE_API}?${p}`).then(r=>{
      if(!r.ok) throw new Error(r.status);
      return r.json();
    });

    const html=data?.parse?.text || "";
    if(!html) throw new Error("empty page html");

    const doc=new DOMParser().parseFromString(html,"text/html");
    const imgs=[...doc.querySelectorAll("img")];

    const wanted=normalizeAnswer(pageName);
    let candidate=null;

    // まず「Ship Card 艦名」に完全に近いものを探す。
    candidate=imgs.find(img=>{
      const alt=(img.getAttribute("alt")||"").trim();
      if(!/^Ship Card /i.test(alt) || /Damaged/i.test(alt)) return false;
      const cardName=alt
        .replace(/^Ship Card /i,"")
        .replace(/\.(png|jpe?g|webp)$/i,"")
        .trim();
      return normalizeAnswer(cardName)===wanted;
    });

    // Wiki側の表記揺れに備えて、艦名を含む通常カードを次候補にする。
    if(!candidate){
      candidate=imgs.find(img=>{
        const alt=(img.getAttribute("alt")||"").trim();
        return /^Ship Card /i.test(alt) &&
               !/Damaged/i.test(alt) &&
               normalizeAnswer(alt).includes(wanted);
      });
    }

    // 基本形態の場合はページ先頭の通常カードを最後の候補にする。
    if(!candidate){
      candidate=imgs.find(img=>{
        const alt=(img.getAttribute("alt")||"").trim();
        return /^Ship Card /i.test(alt) && !/Damaged/i.test(alt);
      });
    }

    if(candidate){
      let url=candidate.getAttribute("src") || candidate.getAttribute("data-src") || "";
      if(!url){
        const srcset=candidate.getAttribute("srcset")||"";
        if(srcset){
          url=srcset.split(",").pop().trim().split(/\s+/)[0];
        }
      }
      url=absoluteKancolleUrl(url);
      if(url){
        cacheSet(key,url);
        return url;
      }
    }

    // HTMLで取れなければ、ページ内の画像リンク名を利用して imageinfo を再照会。
    const imageLink=[...doc.querySelectorAll('a[href*="/File:"], a[title^="File:"]')]
      .find(a=>{
        const t=(a.getAttribute("title")||decodeURIComponent(a.getAttribute("href")||"")).replaceAll("_"," ");
        return /Ship Card/i.test(t) && !/Damaged/i.test(t) && normalizeAnswer(t).includes(wanted);
      });

    const fileTitle=imageLink?.getAttribute("title");
    if(fileTitle){
      const q=new URLSearchParams({
        action:"query",titles:fileTitle,prop:"imageinfo",
        iiprop:"url",format:"json",origin:"*"
      });
      const result=await fetch(`${KANCOLLE_API}?${q}`).then(r=>r.json());
      const page=Object.values(result.query?.pages||{})[0];
      const url=absoluteKancolleUrl(page?.imageinfo?.[0]?.url||"");
      if(url){
        cacheSet(key,url);
        return url;
      }
    }
  }catch(err){
    console.warn("Kancolle page image lookup failed", item.en, err);
  }

  return "";
}

async function wowsImageUrl(item){
  const key=`wowsimg:${item.pageTitle}`;
  const cached=cacheGet(key,30*24*3600*1000);
  if(cached) return cached;
  const p=new URLSearchParams({
    action:"query",titles:item.pageTitle,prop:"pageimages",piprop:"original|thumbnail",
    pithumbsize:"1400",format:"json",origin:"*"
  });
  const data=await fetch(`${WOWS_API}?${p}`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
  const page=Object.values(data.query?.pages||{})[0];
  const url=page?.original?.source||page?.thumbnail?.source||"";
  if(url) cacheSet(key,url);
  return url;
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
