
let allShips = [];
let pool = [];
let questions = [];
let currentIndex = 0;
let correctCount = 0;
let selectedCount = 10;
let endless = false;
let lastSettings = null;
let currentFilterKey = "";
let endlessQueue = [];
let previousEndlessName = null;

const $ = (id) => document.getElementById(id);
const screens = ["home","quiz","result"];

function showScreen(id){
  screens.forEach(s => $(s).classList.toggle("active", s === id));
  window.scrollTo({top:0, behavior:"smooth"});
}

function shuffled(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function historyKey(filterKey){
  return `warshipQuizSeen::${filterKey}`;
}

function loadSeen(filterKey){
  try{
    return JSON.parse(localStorage.getItem(historyKey(filterKey)) || "[]");
  }catch{
    return [];
  }
}

function saveSeen(filterKey, names){
  try{
    localStorage.setItem(historyKey(filterKey), JSON.stringify(names));
  }catch{}
}

function buildNoRepeatQuestions(sourcePool, count, filterKey){
  const namesInPool = new Set(sourcePool.map(s=>s.name));
  let seen = loadSeen(filterKey).filter(n=>namesInPool.has(n));

  // 全艦出し切っていたら新しい周回へ。
  if(seen.length >= sourcePool.length){
    seen = [];
  }

  let unseen = shuffled(sourcePool.filter(s=>!seen.includes(s.name)));
  let result = [];

  while(result.length < count){
    if(unseen.length === 0){
      // ここまでで全艦を1周したので、履歴をリセットして次の周回へ。
      seen = [];
      unseen = shuffled(sourcePool);

      // 周回境界で直前と同じ艦が来にくいようにする。
      if(result.length && unseen.length > 1 && unseen[0].name === result[result.length-1].name){
        [unseen[0], unseen[1]] = [unseen[1], unseen[0]];
      }
    }

    const next = unseen.shift();

    // 同一セッション内は、母数が足りる限り重複させない。
    if(result.some(s=>s.name===next.name) && sourcePool.length >= count){
      continue;
    }

    result.push(next);
    if(!seen.includes(next.name)) seen.push(next.name);

    // 1周完了した時点で履歴をいったん空にして、次回は新しい周回にする。
    if(seen.length >= sourcePool.length && result.length < count){
      seen = [];
    }
  }

  // 次回のために今回出した艦を記録。
  const previousSeen = loadSeen(filterKey).filter(n=>namesInPool.has(n));
  let nextSeen = [...previousSeen];
  for(const ship of result){
    if(!nextSeen.includes(ship.name)) nextSeen.push(ship.name);
    if(nextSeen.length >= sourcePool.length){
      // ちょうど全艦出し切った場合、次回は新しい周回。
      nextSeen = [];
    }
  }
  saveSeen(filterKey, nextSeen);
  return result;
}

function buildEndlessQueue(){
  endlessQueue = shuffled(pool);
  if(previousEndlessName && endlessQueue.length > 1 && endlessQueue[0].name === previousEndlessName){
    [endlessQueue[0], endlessQueue[1]] = [endlessQueue[1], endlessQueue[0]];
  }
}

async function init(){
  const res = await fetch("ships.json");
  allShips = await res.json();

  const countries = [...new Set(allShips.map(s=>s.country))].sort((a,b)=>a.localeCompare(b,"ja"));
  countries.forEach(c=>{
    const o=document.createElement("option");
    o.value=c; o.textContent=c;
    $("countryFilter").appendChild(o);
  });

  $("startBtn").onclick = startQuiz;
  $("nextBtn").onclick = nextQuestion;
  $("quitBtn").onclick = ()=>showScreen("home");
  $("retryBtn").onclick = ()=>{
    if(lastSettings){
      $("questionCount").value = lastSettings.count;
      $("eraFilter").value = lastSettings.era;
      $("countryFilter").value = lastSettings.country;
    }
    startQuiz();
  };
  $("homeBtn").onclick = ()=>showScreen("home");
}

function startQuiz(){
  const era = $("eraFilter").value;
  const country = $("countryFilter").value;
  const countValue = $("questionCount").value;
  selectedCount = Number(countValue);
  endless = selectedCount === 999;

  pool = allShips.filter(s=>{
    const countryOk = country === "all" || s.country === country;
    let eraOk = true;
    if(era === "historic") eraOk = s.year < 1990;
    if(era === "modern") eraOk = s.year >= 1990;
    return countryOk && eraOk;
  });

  if(pool.length < 4){
    alert("この条件では4択を作るための艦が足りません。国または年代を「すべて」にしてください。");
    return;
  }

  currentFilterKey = `${era}::${country}`;
  lastSettings = { count: countValue, era, country };
  currentIndex = 0;
  correctCount = 0;
  previousEndlessName = null;

  if(endless){
    buildEndlessQueue();
  }else{
    questions = buildNoRepeatQuestions(pool, selectedCount, currentFilterKey);
  }

  showScreen("quiz");
  renderQuestion();
}

function currentShip(){
  if(endless){
    if(endlessQueue.length === 0) buildEndlessQueue();
    return endlessQueue[0];
  }
  return questions[currentIndex];
}

async function renderQuestion(){
  $("feedback").classList.add("hidden");
  $("choices").innerHTML = "";
  const ship = currentShip();

  const totalText = endless ? "∞" : String(selectedCount);
  $("progress").textContent = `${currentIndex + 1} / ${totalText}`;
  $("score").textContent = `正解 ${correctCount}`;

  // 正解と同じ艦級の姉妹艦だけに偏らないよう、まず別艦級から候補を取る。
  const differentClass = shuffled(allShips.filter(s=>s.name!==ship.name && s.class!==ship.class));
  const sameClass = shuffled(allShips.filter(s=>s.name!==ship.name && s.class===ship.class));
  const distractors = [...differentClass, ...sameClass].slice(0,3);
  const choiceShips = shuffled([ship, ...distractors]);

  choiceShips.forEach(s=>{
    const b=document.createElement("button");
    b.className="choice";
    b.textContent=`${s.flag} ${s.name}`;
    b.dataset.name=s.name;
    b.onclick=()=>answer(s.name,ship.name,b);
    $("choices").appendChild(b);
  });

  await loadShipImage(ship);
}

async function loadShipImage(ship){
  const img=$("shipImage");
  const loading=$("loading");
  const fallback=$("imageFallback");
  const source=$("sourceLink");

  img.style.display="none";
  fallback.style.display="none";
  loading.style.display="block";
  source.style.display="none";
  img.removeAttribute("src");

  try{
    const title = encodeURIComponent(ship.wiki);
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`);
    if(!res.ok) throw new Error("summary unavailable");
    const data = await res.json();
    const src = data.originalimage?.source || data.thumbnail?.source;
    if(!src) throw new Error("no image");

    await new Promise((resolve,reject)=>{
      img.onload=resolve;
      img.onerror=reject;
      img.src=src;
    });

    img.style.display="block";
    source.href = data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${title}`;
    source.style.display="block";
  }catch(e){
    fallback.style.display="block";
    source.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(ship.wiki)}`;
    source.style.display="block";
  }finally{
    loading.style.display="none";
  }
}

function answer(chosenName, correctName, clickedBtn){
  const ship=currentShip();
  const buttons=[...document.querySelectorAll(".choice")];
  buttons.forEach(b=>{
    b.disabled=true;
    if(b.dataset.name===correctName) b.classList.add("correct");
  });

  const isCorrect = chosenName===correctName;
  if(isCorrect){
    correctCount++;
    $("feedbackMark").textContent="✅ 正解！";
    $("feedbackMark").style.color="var(--ok)";
  }else{
    clickedBtn.classList.add("wrong");
    $("feedbackMark").textContent="❌ 不正解";
    $("feedbackMark").style.color="var(--bad)";
  }

  $("score").textContent=`正解 ${correctCount}`;
  $("answerName").textContent=`${ship.flag} ${ship.name}`;
  $("answerMeta").textContent=`${ship.country} ｜ ${ship.class} ｜ ${ship.type} ｜ 就役 ${ship.year}年`;
  $("answerDesc").textContent=ship.desc;
  $("feedback").classList.remove("hidden");

  $("nextBtn").textContent = (!endless && currentIndex + 1 >= selectedCount) ? "結果を見る" : "次の問題へ";
  $("feedback").scrollIntoView({behavior:"smooth", block:"nearest"});
}

function nextQuestion(){
  if(endless){
    const finished = endlessQueue.shift();
    previousEndlessName = finished?.name || previousEndlessName;
    currentIndex++;
    renderQuestion();
    window.scrollTo({top:0, behavior:"smooth"});
    return;
  }

  currentIndex++;
  if(currentIndex >= selectedCount){
    showResult();
    return;
  }
  renderQuestion();
  window.scrollTo({top:0, behavior:"smooth"});
}

function showResult(){
  const rate=Math.round((correctCount/selectedCount)*100);
  $("resultScore").textContent=`${correctCount} / ${selectedCount}`;
  $("resultRate").textContent=`正答率 ${rate}%`;
  let msg="もう一度挑戦して艦影を覚えよう！";
  if(rate>=90) msg="すごい！かなりの軍艦識別力です！";
  else if(rate>=70) msg="かなり詳しいです！あと少しで上級者！";
  else if(rate>=50) msg="いい感じです。解説を見ながら覚えていこう！";
  $("resultMessage").textContent=msg;
  showScreen("result");
}

init().catch(err=>{
  console.error(err);
  alert("アプリの読み込みに失敗しました。ローカルサーバーまたはGitHub Pagesから起動してください。");
});
