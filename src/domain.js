// 领域层：挂牌判断与所有资料变更规则，与存储、HTTP 页面无关

export class DomainError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

let seq = 0;
function newId(prefix) {
  seq = (seq + 1) % 100000;
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${String(seq).padStart(3, "0")}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

function findPigeon(db, ringNo) {
  const pigeon = db.pigeons.find((item) => item.ringNo === ringNo);
  if (!pigeon) throw new DomainError("pigeon_not_found");
  return pigeon;
}

// 同一足环只保留一份有效挂牌（待审 / 可出价）
export function findActiveListing(db, ringNo) {
  return db.listings.find((item) => item.ringNo === ringNo && (item.status === "pending" || item.status === "open")) || null;
}

function parents(pigeon, db) {
  const father = pigeon.fatherRing ? db.pigeons.find((item) => item.ringNo === pigeon.fatherRing) : null;
  const mother = pigeon.motherRing ? db.pigeons.find((item) => item.ringNo === pigeon.motherRing) : null;
  return {
    fatherRing: pigeon.fatherRing || "",
    fatherFound: Boolean(father),
    motherRing: pigeon.motherRing || "",
    motherFound: Boolean(mother),
  };
}

// 挂牌资格判断：父母资料齐全 + 最近一次转让已确认
export function evaluateListing(pigeon, db) {
  const pedigree = parents(pigeon, db);
  const reasons = [];
  if (!pedigree.fatherRing || !pedigree.fatherFound) reasons.push("father_incomplete");
  if (!pedigree.motherRing || !pedigree.motherFound) reasons.push("mother_incomplete");

  const latestTransfer = [...pigeon.transfers].sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
  if (latestTransfer && !latestTransfer.confirmed) reasons.push("transfer_unconfirmed");

  return { eligible: reasons.length === 0, reasons };
}

function takeSnapshot(pigeon, db) {
  const races = [...pigeon.races].sort((a, b) => (a.date < b.date ? 1 : -1));
  const transfers = [...pigeon.transfers].sort((a, b) => (a.date < b.date ? 1 : -1));
  return {
    ringNo: pigeon.ringNo,
    owner: pigeon.owner,
    pedigree: parents(pigeon, db),
    vaccines: structuredClone(pigeon.vaccines),
    transfers: structuredClone(transfers),
    races: structuredClone(races),
    latestRace: races[0] ? structuredClone(races[0]) : null,
  };
}

// 档案修正：把该足环所有有效挂牌置为失效，旧快照原样保留。返回是否实际失效了挂牌
function invalidateByProfileChange(db, ringNo) {
  let hit = false;
  for (const listing of db.listings) {
    if (listing.ringNo === ringNo && (listing.status === "pending" || listing.status === "open")) {
      listing.status = "invalid";
      listing.invalidReason = "profile_amended";
      listing.invalidatedAt = new Date().toISOString();
      hit = true;
    }
  }
  return hit;
}

/* ---------------- 鸽只档案操作（均会触发挂牌失效判断） ---------------- */

export function createPigeon(db, input) {
  const ringNo = String(input.ringNo || "").trim();
  const owner = String(input.owner || "").trim();
  const color = String(input.color || "").trim();
  const loft = String(input.loft || "").trim();
  if (!ringNo || !owner || !color || !loft) throw new DomainError("invalid_input");
  if (db.pigeons.some((item) => item.ringNo === ringNo)) throw new DomainError("ring_exists");

  const pigeon = {
    ringNo,
    owner,
    color,
    loft,
    fatherRing: String(input.fatherRing || "").trim(),
    motherRing: String(input.motherRing || "").trim(),
    vaccines: [],
    transfers: [],
    races: [],
  };
  db.pigeons.unshift(pigeon);
  return pigeon;
}

export function amendPigeon(db, ringNo, input) {
  const pigeon = findPigeon(db, ringNo);
  const fields = ["owner", "fatherRing", "motherRing", "color", "loft"];
  let changed = false;
  for (const field of fields) {
    if (typeof input[field] !== "string") continue;
    const value = input[field].trim();
    if (!value) throw new DomainError("invalid_input", `${field}_required`);
    if (pigeon[field] !== value) {
      pigeon[field] = value;
      changed = true;
    }
  }
  let invalidated = false;
  if (changed) invalidated = invalidateByProfileChange(db, ringNo);
  return { pigeon, changed, invalidated };
}

export function addVaccine(db, ringNo, input) {
  const pigeon = findPigeon(db, ringNo);
  const name = String(input.name || "").trim();
  if (!name) throw new DomainError("invalid_input", "vaccine_name_required");
  pigeon.vaccines.push({ date: input.date || today(), name });
  invalidateByProfileChange(db, ringNo);
  return pigeon;
}

export function addRace(db, ringNo, input) {
  const pigeon = findPigeon(db, ringNo);
  const event = String(input.event || "").trim();
  if (!event) throw new DomainError("invalid_input", "race_event_required");
  pigeon.races.push({
    date: input.date || today(),
    event,
    distance: Number(input.distance || 0),
    returnTime: String(input.returnTime || ""),
    rank: Number(input.rank || 0),
  });
  invalidateByProfileChange(db, ringNo);
  return pigeon;
}

// 录入转让：未确认前鸽主不变
export function addTransfer(db, ringNo, input) {
  const pigeon = findPigeon(db, ringNo);
  const to = String(input.to || "").trim();
  if (!to) throw new DomainError("invalid_input", "transfer_to_required");
  pigeon.transfers.push({ date: input.date || today(), from: pigeon.owner, to, confirmed: false });
  invalidateByProfileChange(db, ringNo);
  return pigeon;
}

// 确认转让：鸽主变更为该次转让的受让方
export function confirmTransfer(db, ringNo, index) {
  const pigeon = findPigeon(db, ringNo);
  const transfer = pigeon.transfers[index];
  if (!transfer) throw new DomainError("transfer_not_found");
  if (!transfer.confirmed) {
    transfer.confirmed = true;
    pigeon.owner = transfer.to;
    invalidateByProfileChange(db, ringNo);
  }
  return pigeon;
}

/* ---------------- 拍卖挂牌操作 ---------------- */

export function createListing(db, ringNo) {
  const pigeon = findPigeon(db, ringNo);
  if (findActiveListing(db, ringNo)) throw new DomainError("active_listing_exists");

  const { eligible, reasons } = evaluateListing(pigeon, db);
  const listing = {
    id: newId("L"),
    ringNo,
    status: eligible ? "open" : "pending",
    createdAt: new Date().toISOString(),
    snapshot: takeSnapshot(pigeon, db),
    pendingReasons: eligible ? [] : reasons,
    bids: [],
    invalidReason: "",
    invalidatedAt: "",
    withdrawnAt: "",
  };
  db.listings.unshift(listing);
  return listing;
}

// 鸽主撤牌：只动挂牌，资料完全不受影响
export function withdrawListing(db, listingId) {
  const listing = db.listings.find((item) => item.id === listingId);
  if (!listing) throw new DomainError("listing_not_found");
  if (listing.status !== "pending" && listing.status !== "open") throw new DomainError("listing_not_active");
  listing.status = "invalid";
  listing.invalidReason = "owner_withdrawn";
  listing.withdrawnAt = new Date().toISOString();
  listing.invalidatedAt = listing.withdrawnAt;
  return listing;
}

export function placeBid(db, listingId, input) {
  const listing = db.listings.find((item) => item.id === listingId);
  if (!listing) throw new DomainError("listing_not_found");
  if (listing.status !== "open") throw new DomainError("bidding_closed");
  const bidder = String(input.bidder || "").trim();
  const amount = Number(input.amount);
  if (!bidder || !Number.isFinite(amount) || amount <= 0) throw new DomainError("invalid_input", "bidder_or_amount_required");
  const bid = { id: newId("B"), bidder, amount, at: new Date().toISOString() };
  listing.bids.push(bid);
  return bid;
}

export function relation(db, ringNo) {
  const pigeon = db.pigeons.find((item) => item.ringNo === ringNo);
  if (!pigeon) return null;
  const father = db.pigeons.find((item) => item.ringNo === pigeon.fatherRing) || null;
  const mother = db.pigeons.find((item) => item.ringNo === pigeon.motherRing) || null;
  const children = db.pigeons.filter((item) => item.fatherRing === ringNo || item.motherRing === ringNo);
  return { pigeon, father, mother, children, activeListing: findActiveListing(db, ringNo) };
}
