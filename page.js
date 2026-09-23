// 页面操作：只负责呈现 HTML，数据保存和挂牌判断分别在 store.js / listings.js
export const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>赛鸽拍卖挂牌站</title>
  <style>
    :root { --bg:#eff2f5; --panel:#fff; --ink:#1f2833; --muted:#697786; --line:#d3dce4; --accent:#315f83; --red:#9b3f35; --green:#2f6b4f; --amber:#8a6d1d; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.small { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; } h2 { margin:0 0 12px; font-size:18px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:9px 12px; font-weight:700; cursor:pointer; }
    button.warn { background:var(--red); } button.ghost { background:#eef2f5; color:var(--accent); border:1px solid var(--line); } button.ok { background:var(--green); }
    .stack { display:grid; gap:8px; } .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }
    .card { display:grid; gap:8px; align-content:start; } .meta { color:var(--muted); font-size:13px; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .pill.pending { background:#fbf4e0; color:var(--amber); border-color:#e0cf94; }
    .pill.biddable { background:#e7f3ec; color:var(--green); border-color:#aacfbb; }
    .pill.invalidated { background:#f6e8e6; color:var(--red); border-color:#dbb6b1; }
    .section { margin-top:14px; } .relation { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px; }
    .toolbar { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
    .toolbar input { flex:1; min-width:180px; } .tabs { display:flex; gap:8px; flex-wrap:wrap; margin:4px 0 14px; }
    .tabs button { background:#eef2f5; color:var(--accent); border:1px solid var(--line); }
    .tabs button.active { background:var(--accent); color:#fff; }
    .bidbar { display:flex; gap:8px; align-items:center; } .bidbar input { flex:1; min-width:0; }
    .tag { font-size:12px; color:var(--muted); border:1px dashed var(--line); border-radius:6px; padding:6px 8px; background:#fafbfc; }
    .warn-text { color:var(--red); }
    #toast { position:fixed; right:20px; bottom:20px; max-width:340px; background:#1f2833; color:#fff; padding:12px 16px; border-radius:8px; font-size:14px; opacity:0; transform:translateY(10px); transition:.2s; pointer-events:none; }
    #toast.show { opacity:1; transform:translateY(0); }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} .relation{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <header><div><h1>赛鸽拍卖挂牌站</h1><div class="meta">登记档案 · 拍卖挂牌 · 快照出价</div></div><button id="reload">刷新</button></header>
  <main>
    <div class="stack">
      <form id="form">
        <h2>创建鸽只档案</h2>
        <label>足环号</label><input name="ringNo" required>
        <label>鸽主</label><input name="owner" required>
        <label>父鸽足环号</label><input name="fatherRing">
        <label>母鸽足环号</label><input name="motherRing">
        <label>羽色</label><input name="color" required>
        <label>出生棚号</label><input name="loft" required>
        <p class="tag">提示：挂牌时会冻结血统、疫苗、转让和最近成绩；挂牌后再改档案，原挂牌自动失效。</p>
        <button>保存档案</button>
      </form>
      <section class="panel">
        <div class="toolbar"><input id="search" placeholder="输入足环号查询血统"><button id="searchBtn">查询</button></div>
        <div id="detail"><p class="meta">请输入足环号查看父母、转让、疫苗和成绩。</p></div>
      </section>
    </div>
    <section>
      <div class="panel">
        <h2>拍卖挂牌</h2>
        <div class="tabs" id="tabs">
          <button data-filter="all">全部</button>
          <button data-filter="pending">待审</button>
          <button data-filter="biddable">可出价</button>
          <button data-filter="invalidated">已失效</button>
        </div>
        <div class="grid" id="listingCards"></div>
      </div>
      <div class="section panel">
        <h2>鸽只档案</h2>
        <div class="grid" id="cards"></div>
      </div>
    </section>
  </main>
  <div id="toast"></div>
  <script>
    const STATUS_LABEL = { pending: "待审", biddable: "可出价", invalidated: "已失效" };
    const REASON_LABEL = { parents_incomplete: "父母资料不全", transfer_unconfirmed: "转让未确认" };
    const INVALID_LABEL = { profile_changed: "档案已修正", owner_withdrew: "鸽主撤牌" };
    let pigeons = [], listings = [], filter = "all", selectedRing = "";

    function esc(v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers: { "Content-Type": "application/json" } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");
      return data;
    }
    let toastTimer;
    function toast(msg) {
      const el = document.querySelector("#toast");
      el.textContent = msg; el.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
    }
    function errorText(code) {
      return ({
        ring_exists: "该足环号已登记", active_listing_exists: "该足环已有有效挂牌（待审或可出价）",
        listing_under_review: "待审挂牌不能出价", listing_inactive: "挂牌已失效，不能操作",
        not_owner: "只有当前鸽主可以撤牌", bid_too_low: "出价必须高于当前最高",
        invalid_amount: "出价金额不正确", bidder_required: "请填写出价人", pigeon_not_found: "查无此鸽",
        listing_not_found: "挂牌不存在", bad_status: "状态筛选不正确", parents_incomplete: "父母资料不全，仅可待审",
        transfer_unconfirmed: "存在未确认转让，仅可待审"
      })[code] || code;
    }

    function renderPigeonCards() {
      document.querySelector("#cards").innerHTML = pigeons.map(p => {
        const unconfirmed = (p.transfers || []).filter(t => t.confirmed !== true).length;
        return '<article class="card"><h3>' + esc(p.ringNo) + '</h3><span class="pill">' + esc(p.owner) + '</span>'
          + '<div class="meta">' + esc(p.color) + ' · ' + esc(p.loft) + '</div>'
          + '<div>父：' + esc(p.fatherRing || "未登记") + '</div><div>母：' + esc(p.motherRing || "未登记") + '</div>'
          + '<div class="meta">疫苗 ' + (p.vaccines || []).length + ' 次 · 转让 ' + (p.transfers || []).length + ' 条'
          + (unconfirmed ? ' · <b class="warn-text">' + unconfirmed + ' 条未确认</b>' : '') + '</div>'
          + '<button class="ok" data-create="' + esc(p.ringNo) + '">创建拍卖挂牌</button>'
          + '<button class="ghost" data-view="' + esc(p.ringNo) + '">档案操作/查询</button></article>';
      }).join("");
    }

    function renderDetail(data) {
      if (!data) return;
      const p = data.pigeon;
      const transfers = (p.transfers || []).map((t, i) => {
        const mark = t.confirmed !== true ? '<span class="warn-text">未确认</span>' : "已确认";
        const btn = t.confirmed !== true ? ' <button data-confirm-transfer data-ring="' + esc(p.ringNo) + '" data-idx="' + i + '">确认转让</button>' : "";
        return '<div class="small">' + esc(t.date) + ' ' + esc(t.from) + ' → ' + esc(t.to) + ' · ' + mark + btn + '</div>';
      }).join("") || '<p class="meta">暂无转让</p>';
      document.querySelector("#detail").innerHTML =
        '<h2>' + esc(p.ringNo) + ' 档案</h2>'
        + '<div class="relation"><div class="small"><b>父鸽</b><br>' + esc(data.father && data.father.ringNo || p.fatherRing || "未登记") + '</div>'
        + '<div class="small"><b>本鸽</b><br>' + esc(p.owner) + '<br>' + esc(p.color) + ' · ' + esc(p.loft) + '</div>'
        + '<div class="small"><b>母鸽</b><br>' + esc(data.mother && data.mother.ringNo || p.motherRing || "未登记") + '</div></div>'
        + '<div class="meta"><b>子代：</b>' + esc(data.children.map(c => c.ringNo).join("、") || "暂无") + '</div>'
        + '<div class="section"><b>转让记录</b><div class="stack" style="margin-top:8px">' + transfers + '</div></div>'
        + '<div class="section"><b>疫苗记录</b><p class="meta">' + esc((p.vaccines || []).map(v => v.date + " " + v.name).join("；") || "暂无") + '</p></div>'
        + '<label>疫苗名称</label><div class="bidbar"><input data-vaccine="' + esc(p.ringNo) + '" placeholder="如 新城疫"><button data-vaccine-btn="' + esc(p.ringNo) + '">保存疫苗</button></div>'
        + '<div class="section"><b>最近成绩</b><p class="meta">' + esc((p.races || []).slice(-3).reverse().map(r => r.date + " " + r.event + " 第" + r.rank + "名").join("；") || "暂无") + '</p></div>'
        + '<label>成绩（赛事/距离/名次）</label><div class="bidbar"><input data-race="' + esc(p.ringNo) + '" placeholder="200公里/200/6"><button data-score="' + esc(p.ringNo) + '">保存成绩</button></div>'
        + '<div class="section"><b>录入转让</b></div><div class="bidbar"><input data-to="' + esc(p.ringNo) + '" placeholder="新归属人"><button data-transfer="' + esc(p.ringNo) + '">保存转让</button></div>'
        + '<div class="section"><b>档案修正（会让该鸽的有效挂牌失效，旧快照保留）</b></div>'
        + '<div class="stack"><label>鸽主</label><input data-edit-owner="' + esc(p.ringNo) + '" value="' + esc(p.owner) + '">'
        + '<label>父鸽足环号</label><input data-edit-father="' + esc(p.ringNo) + '" value="' + esc(p.fatherRing) + '">'
        + '<label>母鸽足环号</label><input data-edit-mother="' + esc(p.ringNo) + '" value="' + esc(p.motherRing) + '">'
        + '<label>羽色</label><input data-edit-color="' + esc(p.ringNo) + '" value="' + esc(p.color) + '">'
        + '<label>出生棚号</label><input data-edit-loft="' + esc(p.ringNo) + '" value="' + esc(p.loft) + '">'
        + '<button class="warn" data-save-edit="' + esc(p.ringNo) + '">保存修正</button></div>';
    }

    function listingCard(l) {
      const s = l.snapshot;
      const ped = s.pedigree;
      const review = (l.reviewReasons || []).map(r => esc(REASON_LABEL[r.code] || r.code)).join("、");
      const top = l.bids.length ? Math.max.apply(null, l.bids.map(b => b.amount)) : 0;
      let notice = "";
      if (l.status === "pending") notice = '<div class="tag">待审原因：' + review + '，不能公开出价</div>';
      if (l.status === "invalidated") notice = '<div class="tag warn-text">失效原因：' + esc(INVALID_LABEL[l.invalidatedReason] || l.invalidatedReason)
        + (l.changedFields && l.changedFields.length ? "（改动：" + esc(l.changedFields.join("、")) + "）" : "")
        + ' · ' + esc(l.invalidatedAt || "") + '</div>';
      const bidBox = l.status === "biddable"
        ? '<div class="bidbar"><input data-bidder="' + esc(l.id) + '" placeholder="出价人"><input data-bid-amount="' + esc(l.id) + '" type="number" min="1" placeholder="出价金额"><button data-bid="' + esc(l.id) + '">出价</button></div>'
        : '<div class="tag">' + (l.status === "pending" ? "审核通过后可出价" : "挂牌已失效，无法出价") + '</div>';
      const withdraw = l.status !== "invalidated" ? '<button class="warn" data-withdraw="' + esc(l.id) + '">鸽主撤牌</button>' : "";
      return '<article class="card"><span class="pill ' + l.status + '">' + esc(STATUS_LABEL[l.status]) + '</span>'
        + '<h3>' + esc(s.ringNo) + '</h3><span class="pill">鸽主 ' + esc(s.owner) + '</span>'
        + '<div class="meta">挂牌时间 ' + esc(l.createdAt.replace("T", " ").slice(0, 16)) + '</div>'
        + '<div class="small">父：' + esc(ped.father ? ped.father.ringNo : (ped.fatherRing || "未登记"))
        + ' ｜ 母：' + esc(ped.mother ? ped.mother.ringNo : (ped.motherRing || "未登记")) + '</div>'
        + '<div class="meta">羽色 ' + esc(s.color) + ' · 棚号 ' + esc(s.loft) + '</div>'
        + '<div class="meta">疫苗：' + esc((s.vaccines || []).map(v => v.date + " " + v.name).join("；") || "无记录") + '</div>'
        + '<div class="meta">转让：' + esc((s.transfers || []).map(t => t.from + "→" + t.to + (t.confirmed ? "" : "(未确认)")).join("；") || "无记录") + '</div>'
        + '<div class="meta">最近成绩：' + esc(s.latestRace ? s.latestRace.date + " " + s.latestRace.event + " 第" + s.latestRace.rank + "名" : "无记录") + '</div>'
        + '<div class="meta">当前最高出价：' + (top ? top + " 元（共 " + l.bids.length + " 次）" : "暂无") + '</div>'
        + notice + bidBox + withdraw + '</article>';
    }

    function renderListings() {
      document.querySelectorAll("#tabs button").forEach(btn => btn.classList.toggle("active", btn.dataset.filter === filter));
      const list = filter === "all" ? listings : listings.filter(l => l.status === filter);
      const counts = { all: listings.length, pending: 0, biddable: 0, invalidated: 0 };
      listings.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });
      document.querySelectorAll("#tabs button").forEach(btn => {
        const f = btn.dataset.filter;
        btn.textContent = ({ all: "全部", pending: "待审", biddable: "可出价", invalidated: "已失效" })[f] + " (" + counts[f] + ")";
      });
      document.querySelector("#listingCards").innerHTML = list.length
        ? list.map(listingCard).join("")
        : '<p class="meta">暂无' + (filter === "all" ? "" : STATUS_LABEL[filter]) + '挂牌。</p>';
    }

    async function load() {
      pigeons = await api("/api/pigeons");
      listings = await api("/api/listings");
      renderPigeonCards();
      renderListings();
      if (selectedRing) {
        try { renderDetail(await api("/api/pigeons/" + encodeURIComponent(selectedRing) + "/relation")); } catch { selectedRing = ""; }
      }
    }
    async function refreshAndNotify(promise, ok) {
      try { await promise; await load(); toast(ok); } catch (e) { toast(errorText(e.message)); }
    }

    document.querySelector("#reload").onclick = load;
    document.querySelector("#searchBtn").onclick = async () => {
      selectedRing = document.querySelector("#search").value.trim();
      try { renderDetail(await api("/api/pigeons/" + encodeURIComponent(selectedRing) + "/relation")); }
      catch (e) { toast(errorText(e.message)); }
    };
    document.querySelector("#search").addEventListener("keydown", e => { if (e.key === "Enter") document.querySelector("#searchBtn").click(); });
    document.querySelector("#tabs").addEventListener("click", e => {
      const btn = e.target.closest("button[data-filter]");
      if (btn) { filter = btn.dataset.filter; renderListings(); }
    });

    document.querySelector("#form").onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      await refreshAndNotify(
        api("/api/pigeons", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) }),
        "档案已保存"
      );
      form.reset();
    };

    document.addEventListener("click", async e => {
      const attr = name => e.target.closest("[" + name + "]");
      let el;
      if ((el = attr("data-create"))) {
        return refreshAndNotify(api("/api/pigeons/" + encodeURIComponent(el.dataset.create) + "/listings", { method: "POST" }), "挂牌已创建（资料不齐时为待审）");
      }
      if ((el = attr("data-view"))) {
        selectedRing = el.dataset.view;
        document.querySelector("#search").value = selectedRing;
        try { renderDetail(await api("/api/pigeons/" + encodeURIComponent(selectedRing) + "/relation")); } catch (err) { toast(errorText(err.message)); }
        return;
      }
      if ((el = attr("data-withdraw"))) {
        if (!confirm("确认撤牌？撤牌不影响鸽只资料。")) return;
        return refreshAndNotify(api("/api/listings/" + encodeURIComponent(el.dataset.withdraw) + "/withdraw", { method: "POST" }), "已撤牌，鸽只资料保持不变");
      }
      if ((el = attr("data-bid"))) {
        const id = el.dataset.bid;
        const bidder = document.querySelector('[data-bidder="' + id + '"]').value;
        const amount = document.querySelector('[data-bid-amount="' + id + '"]').value;
        return refreshAndNotify(api("/api/listings/" + encodeURIComponent(id) + "/bids", { method: "POST", body: JSON.stringify({ bidder, amount }) }), "出价成功");
      }
      if ((el = attr("data-confirm-transfer"))) {
        return refreshAndNotify(api("/api/pigeons/" + encodeURIComponent(el.dataset.ring) + "/transfers/" + el.dataset.idx + "/confirm", { method: "POST" }), "转让已确认");
      }
      if ((el = attr("data-transfer"))) {
        const ring = el.dataset.transfer;
        const to = document.querySelector('[data-to="' + ring + '"]').value.trim();
        if (!to) return toast("请填写新归属人");
        return refreshAndNotify(api("/api/pigeons/" + encodeURIComponent(ring) + "/transfers", { method: "POST", body: JSON.stringify({ to }) }), "转让已记录（待确认）");
      }
      if ((el = attr("data-vaccine-btn"))) {
        const ring = el.dataset.vaccineBtn;
        const name = document.querySelector('[data-vaccine="' + ring + '"]').value.trim();
        if (!name) return toast("请填写疫苗名称");
        return refreshAndNotify(api("/api/pigeons/" + encodeURIComponent(ring) + "/vaccines", { method: "POST", body: JSON.stringify({ name }) }), "疫苗已保存");
      }
      if ((el = attr("data-score"))) {
        const ring = el.dataset.score;
        const raw = document.querySelector('[data-race="' + ring + '"]').value.split("/");
        return refreshAndNotify(api("/api/pigeons/" + encodeURIComponent(ring) + "/races", { method: "POST", body: JSON.stringify({ event: raw[0] || "未命名赛事", distance: Number(raw[1] || 0), rank: Number(raw[2] || 0) }) }), "成绩已保存");
      }
      if ((el = attr("data-save-edit"))) {
        const ring = el.dataset.saveEdit;
        const pick = key => document.querySelector('[data-edit-' + key + '="' + ring + '"]').value;
        return refreshAndNotify(api("/api/pigeons/" + encodeURIComponent(ring), {
          method: "PATCH",
          body: JSON.stringify({ owner: pick("owner"), fatherRing: pick("father"), motherRing: pick("mother"), color: pick("color"), loft: pick("loft") })
        }), "档案已修正，原挂牌失效并保留快照");
      }
    });

    load();
  </script>
</body>
</html>`;
