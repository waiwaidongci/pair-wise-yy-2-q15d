import http from "node:http";
import { loadDb, saveDb } from "./src/store.js";
import {
  DomainError,
  createPigeon,
  amendPigeon,
  addVaccine,
  addRace,
  addTransfer,
  confirmTransfer,
  createListing,
  withdrawListing,
  placeBid,
  relation,
} from "./src/domain.js";

const port = Number(process.env.PORT || 3024);

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

const statusMap = {
  invalid_input: 400,
  ring_exists: 409,
  active_listing_exists: 409,
  bidding_closed: 409,
  listing_not_active: 409,
  pigeon_not_found: 404,
  listing_not_found: 404,
  transfer_not_found: 404,
};

// HTTP 层：只做路由、参数解析和页面呈现，业务规则全部在 domain 层
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const db = await loadDb();

    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page);
    }

    if (req.method === "GET" && path === "/api/pigeons") return sendJson(res, 200, db.pigeons);

    if (req.method === "POST" && path === "/api/pigeons") {
      const pigeon = createPigeon(db, await body(req));
      await saveDb(db);
      return sendJson(res, 201, pigeon);
    }

    if (req.method === "GET" && path === "/api/listings") {
      const status = url.searchParams.get("status") || "all";
      const listings = status === "all" ? db.listings : db.listings.filter((item) => item.status === status);
      return sendJson(res, 200, listings);
    }

    let m;

    if ((m = path.match(/^\/api\/pigeons\/(.+)\/relation$/)) && req.method === "GET") {
      const data = relation(db, decodeURIComponent(m[1]));
      return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: "pigeon_not_found" });
    }

    if ((m = path.match(/^\/api\/pigeons\/(.+)\/listings$/)) && req.method === "POST") {
      const listing = createListing(db, decodeURIComponent(m[1]));
      await saveDb(db);
      return sendJson(res, 201, listing);
    }

    if ((m = path.match(/^\/api\/pigeons\/(.+)\/transfers\/(\d+)\/confirm$/)) && req.method === "POST") {
      const pigeon = confirmTransfer(db, decodeURIComponent(m[1]), Number(m[2]));
      await saveDb(db);
      return sendJson(res, 200, pigeon);
    }

    if ((m = path.match(/^\/api\/listings\/(.+)\/withdraw$/)) && req.method === "POST") {
      const listing = withdrawListing(db, decodeURIComponent(m[1]));
      await saveDb(db);
      return sendJson(res, 200, listing);
    }

    if ((m = path.match(/^\/api\/listings\/(.+)\/bids$/)) && req.method === "POST") {
      const bid = placeBid(db, decodeURIComponent(m[1]), await body(req));
      await saveDb(db);
      return sendJson(res, 201, bid);
    }

    if ((m = path.match(/^\/api\/pigeons\/(.+)$/)) && req.method === "PATCH") {
      const { pigeon, changed, invalidated } = amendPigeon(db, decodeURIComponent(m[1]), await body(req));
      await saveDb(db);
      return sendJson(res, 200, { pigeon, changed, invalidated });
    }

    if ((m = path.match(/^\/api\/pigeons\/(.+)\/(transfers|races|vaccines)$/)) && req.method === "POST") {
      const ringNo = decodeURIComponent(m[1]);
      const input = await body(req);
      const pigeon =
        m[2] === "transfers" ? addTransfer(db, ringNo, input)
        : m[2] === "races" ? addRace(db, ringNo, input)
        : addVaccine(db, ringNo, input);
      await saveDb(db);
      return sendJson(res, 200, pigeon);
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof DomainError) return sendJson(res, statusMap[error.code] || 400, { error: error.code, detail: error.message });
    sendJson(res, 500, { error: error.message });
  }
});

const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>赛鸽拍卖挂牌站</title>
  <style>
    :root { --bg:#eff2f5; --panel:#fff; --ink:#1f2833; --muted:#697786; --line:#d3dce4; --accent:#315f83; --red:#9b3f35; --green:#2e7047; --amber:#9a6b1f; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; align-items:start; }
    form,.panel,.card,.stat { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; }
    .side { display:grid; gap:16px; position:sticky; top:16px; }
    h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; font-size:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:9px 13px; font-weight:700; cursor:pointer; }
    button.ghost { background:#eef3f7; color:var(--accent); border:1px solid var(--line); }
    button.warn { background:#f4e7e5; color:var(--red); border:1px solid #e3c4bf; }
    button:disabled { opacity:.5; cursor:not-allowed; }
    .toolbar { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; align-items:center; }
    .toolbar input { max-width:260px; }
    .tabs { display:flex; gap:6px; }
    .tabs button { background:#eef3f7; color:var(--muted); border:1px solid var(--line); padding:7px 14px; }
    .tabs button.active { background:var(--accent); color:#fff; border-color:var(--accent); }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
    .card { display:grid; gap:8px; align-content:start; }
    .meta { color:var(--muted); font-size:13px; }
    .row { display:flex; justify-content:space-between; gap:8px; align-items:center; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 10px; font-size:12px; white-space:nowrap; }
    .pill.open { background:#e7f3ec; color:var(--green); border-color:#bfe0cc; }
    .pill.pending { background:#fbf2df; color:var(--amber); border-color:#ecd9ad; }
    .pill.invalid { background:#eceff2; color:var(--muted); }
    .kv { font-size:13px; line-height:1.7; } .kv b { color:var(--muted); font-weight:400; }
    .miss { color:var(--red); } .ok { color:var(--green); }
    .note { font-size:12px; border-radius:6px; padding:7px 9px; background:#fbf2df; color:var(--amber); border:1px solid #ecd9ad; }
    .note.red { background:#f4e7e5; color:var(--red); border-color:#e3c4bf; }
    .inline { display:grid; grid-template-columns:1fr auto; gap:6px; margin-top:4px; }
    .bidbox { display:grid; grid-template-columns:1fr 1fr auto; gap:6px; }
    .section { margin-top:18px; }
    .relation { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:10px 0; }
    .small { background:#f8fafb; border:1px solid var(--line); border-radius:8px; padding:10px; font-size:13px; }
    .amend { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:10px; }
    .toast { position:fixed; right:20px; bottom:20px; background:var(--ink); color:#fff; padding:10px 16px; border-radius:8px; font-size:14px; opacity:0; transform:translateY(8px); transition:.2s; pointer-events:none; }
    .toast.show { opacity:1; transform:translateY(0); }
    @media (max-width:980px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} .side{position:static;} .relation,.amend{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <header>
    <div><h1>赛鸽拍卖挂牌站</h1><div class="meta">血统 · 疫苗 · 转让 · 成绩 快照挂牌，同一足环仅一份有效挂牌</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <div class="side">
      <div class="panel">
        <h2>创建拍卖挂牌</h2>
        <label>选择足环号</label>
        <select id="listRing"></select>
        <div class="meta" id="listHint" style="margin:8px 0 10px;"></div>
        <button id="listBtn" style="width:100%;">创建挂牌（保存资料快照）</button>
      </div>
      <form id="form">
        <h2>创建鸽只档案</h2>
        <label>足环号</label><input name="ringNo" required>
        <label>鸽主</label><input name="owner" required>
        <label>父鸽足环号</label><input name="fatherRing">
        <label>母鸽足环号</label><input name="motherRing">
        <label>羽色</label><input name="color" required>
        <label>出生棚号</label><input name="loft" required>
        <div style="margin-top:12px;"><button>保存档案</button></div>
      </form>
    </div>
    <section>
      <h2>拍卖大厅</h2>
      <div class="toolbar tabs" id="filters">
        <button data-filter="all" class="active">全部</button>
        <button data-filter="pending">待审</button>
        <button data-filter="open">可出价</button>
        <button data-filter="invalid">已失效</button>
      </div>
      <div class="grid" id="listingCards"></div>

      <div class="section">
        <h2>鸽只档案</h2>
        <div class="toolbar"><input id="search" placeholder="输入足环号查询血统与挂牌"><button id="searchBtn" class="ghost">查询</button></div>
        <div class="panel" id="detail"></div>
        <div class="section grid" id="cards"></div>
      </div>
    </section>
  </main>
  <div class="toast" id="toast"></div>
  <script>
    const $ = sel => document.querySelector(sel);
    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
    let pigeons = [], listings = [], filter = "all", detailRing = "";

    const errText = {
      ring_exists: "该足环号已登记", active_listing_exists: "同一足环已有有效挂牌（待审或可出价）",
      pigeon_not_found: "未找到该足环档案", listing_not_found: "挂牌不存在", listing_not_active: "挂牌已失效，无法操作",
      bidding_closed: "当前状态不能公开出价（仅可出价挂牌接受报价）", transfer_not_found: "转让记录不存在",
      invalid_input: "提交信息不完整",
    };
    function toast(msg, isErr) {
      const t = $("#toast"); t.textContent = msg; t.style.background = isErr ? "var(--red)" : "var(--ink)";
      t.classList.add("show"); clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove("show"), 2600);
    }
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers: { "Content-Type": "application/json" } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(errText[data.error] || data.error || "请求失败");
      return data;
    }

    const statusLabel = { pending: "待审", open: "可出价", invalid: "已失效" };
    const reasonText = {
      father_incomplete: "父鸽资料不全", mother_incomplete: "母鸽资料不全", transfer_unconfirmed: "最近一次转让未确认",
      profile_amended: "档案已被修正，旧快照保留备查", owner_withdrawn: "鸽主已撤牌",
    };
    const fmt = at => at ? new Date(at).toLocaleString("zh-CN", { hour12:false }) : "";

    function activeOf(ring) {
      return listings.find(l => l.ringNo === ring && (l.status === "pending" || l.status === "open")) || null;
    }

    function renderListSelect() {
      const ring = $("#listRing").value;
      $("#listRing").innerHTML = pigeons.map(p => '<option value="'+esc(p.ringNo)+'">'+esc(p.ringNo)+' · '+esc(p.owner)+'</option>').join("");
      if (ring && pigeons.some(p => p.ringNo === ring)) $("#listRing").value = ring;
      renderListHint();
    }
    function renderListHint() {
      const active = activeOf($("#listRing").value);
      $("#listHint").innerHTML = active ? '当前为<span class="pill '+active.status+'">'+statusLabel[active.status]+'</span>有效挂牌，不能重复创建' : "父母资料齐全且最近转让已确认时，创建后即可出价；否则进入待审。";
      $("#listBtn").disabled = Boolean(active) || pigeons.length === 0;
    }

    function pedigreeHtml(snap) {
      const p = snap.pedigree;
      return '<div><b>父鸽</b> '+(p.fatherRing ? esc(p.fatherRing) : '<span class="miss">未填写</span>')+(p.fatherFound ? ' <span class="ok">档案在册</span>' : ' <span class="miss">档案缺失</span>')+'</div>'
           + '<div><b>母鸽</b> '+(p.motherRing ? esc(p.motherRing) : '<span class="miss">未填写</span>')+(p.motherFound ? ' <span class="ok">档案在册</span>' : ' <span class="miss">档案缺失</span>')+'</div>';
    }
    function renderListingCard(l) {
      const s = l.snapshot;
      const transferHtml = s.transfers.length
        ? s.transfers.map(t => esc(t.date)+" "+esc(t.from)+" → "+esc(t.to)+(t.confirmed ? ' <span class="ok">已确认</span>' : ' <span class="miss">未确认</span>')).join("<br>")
        : "无转让记录";
      const race = s.latestRace;
      let actions = "";
      if (l.status === "pending") actions = '<div class="note">待审原因：'+l.pendingReasons.map(r => reasonText[r]).join("；")+'。资料补齐并重新挂牌后方可出价。</div>';
      if (l.status === "invalid") actions = '<div class="note red">'+reasonText[l.invalidReason]+(l.invalidatedAt ? "（"+fmt(l.invalidatedAt)+"）" : "")+'</div>';
      if (l.status === "open") {
        actions = '<div class="bidbox"><input id="bidby-'+l.id+'" placeholder="买家称呼"><input id="bidamt-'+l.id+'" placeholder="出价（元）" type="number" min="1"><button data-action="bid" data-id="'+l.id+'">出价</button></div>';
      }
      if (l.status === "pending" || l.status === "open") {
        actions += '<button class="warn" style="width:100%;margin-top:8px;" data-action="withdraw" data-id="'+l.id+'">鸽主撤牌</button>';
      }
      const bids = l.bids.length
        ? '<div class="kv"><b>报价（'+l.bids.length+'）</b> '+l.bids.slice(-3).map(b => esc(b.bidder)+" "+b.amount+"元").join("、")+(l.bids.length > 3 ? " …" : "")+'</div>'
        : "";
      return '<article class="card">'
        + '<div class="row"><h3>'+esc(s.ringNo)+'</h3><span class="pill '+l.status+'">'+statusLabel[l.status]+'</span></div>'
        + '<div class="meta">鸽主 '+esc(s.owner)+' · 挂牌于 '+fmt(l.createdAt)+'</div>'
        + '<div class="kv">'+pedigreeHtml(s)+'</div>'
        + '<div class="kv"><b>疫苗</b> '+(s.vaccines.map(v => esc(v.date)+" "+esc(v.name)).join("、") || "无记录")+'</div>'
        + '<div class="kv"><b>转让</b><br>'+transferHtml+'</div>'
        + '<div class="kv"><b>最近成绩</b> '+(race ? esc(race.date)+" "+esc(race.event)+" "+race.distance+"公里 第"+race.rank+"名" : "暂无成绩")+'</div>'
        + bids + actions
        + '</article>';
    }
    function renderListings() {
      const list = filter === "all" ? listings : listings.filter(l => l.status === filter);
      $("#listingCards").innerHTML = list.length ? list.map(renderListingCard).join("") : '<p class="meta">没有匹配的挂牌。</p>';
    }

    function renderPigeonCard(p) {
      const active = activeOf(p.ringNo);
      const listCtrl = active
        ? '<span class="pill '+active.status+'">挂牌中：'+statusLabel[active.status]+'</span>'
        : '<button data-action="list" data-ring="'+esc(p.ringNo)+'">创建挂牌</button>';
      const latest = p.transfers[p.transfers.length - 1];
      const confirmBtn = latest && !latest.confirmed
        ? '<div class="inline"><span class="meta">最近转让 '+esc(latest.to)+' 未确认</span><button class="ghost" data-action="confirm" data-ring="'+esc(p.ringNo)+'" data-index="'+(p.transfers.length-1)+'">确认转让</button></div>'
        : "";
      return '<article class="card">'
        + '<div class="row"><h3>'+esc(p.ringNo)+'</h3><span class="pill">'+esc(p.owner)+'</span></div>'
        + '<div class="meta">'+esc(p.color)+' · '+esc(p.loft)+'</div>'
        + '<div class="kv"><div><b>父</b> '+(esc(p.fatherRing) || '<span class="miss">未登记</span>')+'</div><div><b>母</b> '+(esc(p.motherRing) || '<span class="miss">未登记</span>')+'</div></div>'
        + listCtrl
        + '<label>录入转让（未确认前不公开）</label><div class="inline"><input id="tr-'+esc(p.ringNo)+'" placeholder="新归属人"><button data-action="transfer" data-ring="'+esc(p.ringNo)+'">保存</button></div>'
        + confirmBtn
        + '<label>录入疫苗</label><div class="inline"><input id="vac-'+esc(p.ringNo)+'" placeholder="疫苗名称，如 腺病毒"><button data-action="vaccine" data-ring="'+esc(p.ringNo)+'">保存</button></div>'
        + '<label>归巢成绩（赛事/距离/名次）</label><div class="inline"><input id="race-'+esc(p.ringNo)+'" placeholder="200公里/200/6"><button data-action="race" data-ring="'+esc(p.ringNo)+'">保存</button></div>'
        + '</article>';
    }
    function renderPigeons() {
      $("#cards").innerHTML = pigeons.map(renderPigeonCard).join("");
    }

    function renderDetail() {
      if (!detailRing) {
        $("#detail").innerHTML = '<h2>血统与档案修正</h2><p class="meta">输入足环号查看父母、子代、转让、成绩，并可修正档案；修正后该足环的有效挂牌会立即失效，旧快照保留。</p>';
        return;
      }
      api('/api/pigeons/'+encodeURIComponent(detailRing)+'/relation').then(data => {
        const p = data.pigeon;
        const active = data.activeListing;
        $("#detail").innerHTML =
          '<h2>'+esc(p.ringNo)+' 血统档案</h2>'
          + '<div class="relation"><div class="small"><b>父鸽</b><br>'+(data.father ? esc(data.father.ringNo)+" "+esc(data.father.color) : (p.fatherRing ? esc(p.fatherRing)+' <span class="miss">档案缺失</span>' : '<span class="miss">未登记</span>'))+'</div>'
          + '<div class="small"><b>本鸽</b><br>'+esc(p.owner)+' · '+esc(p.color)+'<br>'+esc(p.loft)+'</div>'
          + '<div class="small"><b>母鸽</b><br>'+(data.mother ? esc(data.mother.ringNo)+" "+esc(data.mother.color) : (p.motherRing ? esc(p.motherRing)+' <span class="miss">档案缺失</span>' : '<span class="miss">未登记</span>'))+'</div></div>'
          + '<div class="kv"><b>子代</b> '+(data.children.map(c => esc(c.ringNo)).join("、") || "暂无")+'</div>'
          + '<div class="kv"><b>转让</b> '+(p.transfers.map(t => esc(t.date)+" "+esc(t.from)+"→"+esc(t.to)+(t.confirmed ? " 已确认" : ' <span class="miss">未确认</span>')).join(" / ") || "暂无")+'</div>'
          + '<div class="kv"><b>疫苗</b> '+(p.vaccines.map(v => esc(v.date)+" "+esc(v.name)).join(" / ") || "暂无")+'</div>'
          + '<div class="kv"><b>归巢</b> '+(p.races.map(r => esc(r.event)+" 第"+r.rank+"名").join(" / ") || "暂无")+'</div>'
          + '<div style="margin-top:8px;">'+(active ? '<span class="pill '+active.status+'">当前有效挂牌：'+statusLabel[active.status]+'（修正档案将使其失效）</span>' : '<span class="meta">当前无有效挂牌</span>')+'</div>'
          + '<div class="amend">'
          + '<input id="am-owner" placeholder="鸽主" value="'+esc(p.owner)+'">'
          + '<input id="am-father" placeholder="父鸽足环" value="'+esc(p.fatherRing)+'">'
          + '<input id="am-mother" placeholder="母鸽足环" value="'+esc(p.motherRing)+'">'
          + '<input id="am-color" placeholder="羽色" value="'+esc(p.color)+'">'
          + '<input id="am-loft" placeholder="棚号" value="'+esc(p.loft)+'">'
          + '<button data-action="amend" data-ring="'+esc(p.ringNo)+'">修正档案</button>'
          + '</div>';
      }).catch(() => { $("#detail").innerHTML = '<p class="meta">未找到该足环档案。</p>'; });
    }

    async function load() {
      [pigeons, listings] = await Promise.all([api("/api/pigeons"), api("/api/listings")]);
      renderListSelect(); renderListings(); renderPigeons(); renderDetail();
    }

    $("#filters").addEventListener("click", e => {
      const btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      filter = btn.dataset.filter;
      document.querySelectorAll("#filters button").forEach(b => b.classList.toggle("active", b === btn));
      renderListings();
    });

    $("#listRing").addEventListener("change", renderListHint);
    $("#listBtn").onclick = async () => {
      try {
        const l = await api('/api/pigeons/'+encodeURIComponent($("#listRing").value)+"/listings", { method: "POST", body: "{}" });
        toast(l.status === "open" ? "挂牌成功，已可公开出价" : "已进入待审：" + l.pendingReasons.map(r => reasonText[r]).join("；"));
        await load();
      } catch (e) { toast(e.message, true); }
    };

    document.addEventListener("click", async e => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const ring = btn.dataset.ring, id = btn.dataset.id, act = btn.dataset.action;
      try {
        if (act === "withdraw") { await api('/api/listings/'+encodeURIComponent(id)+"/withdraw", { method:"POST", body:"{}" }); toast("已撤牌，鸽只资料不受影响"); }
        if (act === "bid") {
          const bidder = $("#bidby-"+id).value.trim(), amount = Number($("#bidamt-"+id).value);
          if (!bidder || !amount) return toast("请填写买家称呼和出价", true);
          await api('/api/listings/'+encodeURIComponent(id)+"/bids", { method:"POST", body: JSON.stringify({ bidder, amount }) });
          toast("报价已提交");
        }
        if (act === "list") { $("#listRing").value = ring; renderListHint(); $("#listBtn").click(); return; }
        if (act === "transfer") {
          const to = $("#tr-"+ring).value.trim();
          if (!to) return toast("请填写新归属人", true);
          await api('/api/pigeons/'+encodeURIComponent(ring)+"/transfers", { method:"POST", body: JSON.stringify({ to }) });
          toast("转让已录入，确认前为待审状态");
        }
        if (act === "confirm") {
          await api('/api/pigeons/'+encodeURIComponent(ring)+"/transfers/"+btn.dataset.index+"/confirm", { method:"POST", body:"{}" });
          toast("转让已确认，鸽主已变更");
        }
        if (act === "vaccine") {
          const name = $("#vac-"+ring).value.trim();
          if (!name) return toast("请填写疫苗名称", true);
          await api('/api/pigeons/'+encodeURIComponent(ring)+"/vaccines", { method:"POST", body: JSON.stringify({ name }) });
          toast("疫苗已记录");
        }
        if (act === "race") {
          const raw = $("#race-"+ring).value.split("/");
          await api('/api/pigeons/'+encodeURIComponent(ring)+"/races", { method:"POST", body: JSON.stringify({ event: raw[0]?.trim() || "未命名赛事", distance: Number(raw[1] || 0), rank: Number(raw[2] || 0) }) });
          toast("成绩已记录");
        }
        if (act === "amend") {
          const payload = { owner: $("#am-owner").value, fatherRing: $("#am-father").value, motherRing: $("#am-mother").value, color: $("#am-color").value, loft: $("#am-loft").value };
          const r = await api('/api/pigeons/'+encodeURIComponent(ring), { method:"PATCH", body: JSON.stringify(payload) });
          toast(r.changed ? "档案已修正，相关有效挂牌已失效（旧快照保留）" : "资料没有变化");
        }
        await load();
      } catch (err) { toast(err.message, true); }
    });

    $("#searchBtn").onclick = () => { detailRing = $("#search").value.trim(); renderDetail(); };
    $("#reload").onclick = load;
    $("#form").onsubmit = async event => {
      event.preventDefault();
      try {
        await api("/api/pigeons", { method:"POST", body: JSON.stringify(Object.fromEntries(new FormData($("#form").entries()))) });
        $("#form").reset(); toast("档案已创建"); await load();
      } catch (err) { toast(err.message, true); }
    };
    load();
  </script>
</body>
</html>`;

server.listen(port, () => console.log(`Racing pigeon auction app listening on http://localhost:${port}`));
