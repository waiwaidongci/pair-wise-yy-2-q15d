import http from "node:http";
import { loadDb, saveDb } from "./store.js";
import { page } from "./page.js";
import {
  LISTING_STATUS,
  ListingError,
  createListing,
  queryListings,
  withdrawListing,
  placeBid,
  invalidateByProfileChange,
  today
} from "./listings.js";

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
function fail(res, error) {
  if (error instanceof ListingError) return sendJson(res, error.status, { error: error.code });
  if (error instanceof SyntaxError) return sendJson(res, 400, { error: "bad_json" });
  return sendJson(res, 500, { error: error.message });
}
function findPigeon(db, ringNo) {
  return db.pigeons.find(item => item.ringNo === ringNo) || null;
}
function relation(db, ringNo) {
  const pigeon = findPigeon(db, ringNo);
  if (!pigeon) return null;
  const father = db.pigeons.find(item => item.ringNo === pigeon.fatherRing) || null;
  const mother = db.pigeons.find(item => item.ringNo === pigeon.motherRing) || null;
  const children = db.pigeons.filter(item => item.fatherRing === ringNo || item.motherRing === ringNo);
  return { pigeon, father, mother, children };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page);
    }

    // ---------- 鸽只档案 ----------
    if (req.method === "GET" && url.pathname === "/api/pigeons") {
      return sendJson(res, 200, db.pigeons);
    }

    if (req.method === "POST" && url.pathname === "/api/pigeons") {
      const input = await body(req);
      if (!input.ringNo || !input.owner) return sendJson(res, 400, { error: "ringNo_owner_required" });
      if (db.pigeons.some(item => item.ringNo === input.ringNo)) return sendJson(res, 409, { error: "ring_exists" });
      const pigeon = {
        ringNo: input.ringNo,
        owner: input.owner,
        fatherRing: input.fatherRing || "",
        motherRing: input.motherRing || "",
        color: input.color || "",
        loft: input.loft || "",
        vaccines: [],
        transfers: [],
        races: []
      };
      db.pigeons.unshift(pigeon);
      await saveDb(db);
      return sendJson(res, 201, pigeon);
    }

    // 档案修正：记录改了哪些字段，并让该鸽的有效挂牌失效
    const pigeonPatch = url.pathname.match(/^\/api\/pigeons\/(.+)$/);
    if (pigeonPatch && req.method === "PATCH") {
      const ringNo = decodeURIComponent(pigeonPatch[1]);
      const pigeon = findPigeon(db, ringNo);
      if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
      const input = await body(req);
      const fields = ["owner", "fatherRing", "motherRing", "color", "loft"];
      const changed = [];
      for (const field of fields) {
        if (input[field] != null && String(input[field]) !== String(pigeon[field] ?? "")) {
          pigeon[field] = String(input[field]);
          changed.push(field);
        }
      }
      if (changed.length) invalidateByProfileChange(db, ringNo, changed);
      await saveDb(db);
      return sendJson(res, 200, { pigeon, changedFields: changed });
    }

    const relationMatch = url.pathname.match(/^\/api\/pigeons\/(.+)\/relation$/);
    if (relationMatch && req.method === "GET") {
      const data = relation(db, decodeURIComponent(relationMatch[1]));
      return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: "pigeon_not_found" });
    }

    // 确认某条转让记录；确认本身也是档案变化，有效挂牌失效（需重新挂牌重新审核）
    const transferConfirm = url.pathname.match(/^\/api\/pigeons\/(.+)\/transfers\/(\d+)\/confirm$/);
    if (transferConfirm && req.method === "POST") {
      const pigeon = findPigeon(db, decodeURIComponent(transferConfirm[1]));
      if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
      const record = pigeon.transfers[Number(transferConfirm[2])];
      if (!record) return sendJson(res, 404, { error: "transfer_not_found" });
      const wasConfirmed = record.confirmed === true;
      record.confirmed = true;
      if (!wasConfirmed) invalidateByProfileChange(db, pigeon.ringNo, ["transferConfirmed"]);
      await saveDb(db);
      return sendJson(res, 200, pigeon);
    }

    const actionMatch = url.pathname.match(/^\/api\/pigeons\/(.+)\/(transfers|races|vaccines)$/);
    if (actionMatch && req.method === "POST") {
      const pigeon = findPigeon(db, decodeURIComponent(actionMatch[1]));
      if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
      const input = await body(req);
      let changedFields;
      if (actionMatch[2] === "transfers") {
        if (!input.to) return sendJson(res, 400, { error: "to_required" });
        pigeon.transfers.push({ date: input.date || today(), from: pigeon.owner, to: input.to, confirmed: false });
        pigeon.owner = input.to;
        changedFields = ["owner", "transfers"];
      } else if (actionMatch[2] === "races") {
        pigeon.races.push({ date: input.date || today(), event: input.event, distance: Number(input.distance || 0), returnTime: input.returnTime || "", rank: Number(input.rank || 0) });
        changedFields = ["races"];
      } else {
        if (!input.name) return sendJson(res, 400, { error: "name_required" });
        pigeon.vaccines.push({ date: input.date || today(), name: input.name });
        changedFields = ["vaccines"];
      }
      // 追加疫苗/成绩/转让都属于档案变化，挂牌快照随之过时 -> 失效并保留旧快照
      invalidateByProfileChange(db, pigeon.ringNo, changedFields);
      await saveDb(db);
      return sendJson(res, 200, pigeon);
    }

    // ---------- 拍卖挂牌 ----------
    if (req.method === "GET" && url.pathname === "/api/listings") {
      const status = url.searchParams.get("status") || "";
      if (status && !Object.values(LISTING_STATUS).includes(status)) {
        return sendJson(res, 400, { error: "bad_status" });
      }
      return sendJson(res, 200, queryListings(db, status || null));
    }

    const createMatch = url.pathname.match(/^\/api\/pigeons\/(.+)\/listings$/);
    if (createMatch && req.method === "POST") {
      const pigeon = findPigeon(db, decodeURIComponent(createMatch[1]));
      if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
      const listing = createListing(db, pigeon);
      await saveDb(db);
      return sendJson(res, 201, listing);
    }

    const withdrawMatch = url.pathname.match(/^\/api\/listings\/(.+)\/withdraw$/);
    if (withdrawMatch && req.method === "POST") {
      const input = await body(req);
      const listing = withdrawListing(db, decodeURIComponent(withdrawMatch[1]), input.owner || null);
      await saveDb(db);
      return sendJson(res, 200, listing);
    }

    const bidMatch = url.pathname.match(/^\/api\/listings\/(.+)\/bids$/);
    if (bidMatch && req.method === "POST") {
      const input = await body(req);
      const { listing, bid } = placeBid(db, decodeURIComponent(bidMatch[1]), input.bidder, input.amount);
      await saveDb(db);
      return sendJson(res, 201, { listing, bid });
    }

    return sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    return fail(res, error);
  }
});

server.listen(port, () => console.log(`Racing pigeon auction app listening on http://localhost:${port}`));
