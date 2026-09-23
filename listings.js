import { randomUUID } from "node:crypto";

// 挂牌判断：纯领域逻辑，不碰文件存储，也不知道页面/HTTP
export const LISTING_STATUS = {
  PENDING: "pending",       // 待审：资料不齐，不能公开出价
  BIDDABLE: "biddable",     // 可出价
  INVALIDATED: "invalidated" // 已失效（档案被修正或鸽主撤牌）
};

export class ListingError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export const INVALID_REASON = {
  PROFILE_CHANGED: "profile_changed",
  OWNER_WITHDREW: "owner_withdrew"
};

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// 父母资料不全：父母足环都登记、且父母档案都查得到，才算齐全
function missingParents(db, pigeon) {
  const missing = [];
  if (!pigeon.fatherRing) {
    missing.push("father");
  } else if (!db.pigeons.some(item => item.ringNo === pigeon.fatherRing)) {
    missing.push("father_not_registered");
  }
  if (!pigeon.motherRing) {
    missing.push("mother");
  } else if (!db.pigeons.find(item => item.ringNo === pigeon.motherRing)) {
    missing.push("mother_not_registered");
  }
  return missing;
}

// 转让未确认：任何一条转让记录没有确认标记都算
function unconfirmedTransfers(pigeon) {
  return (pigeon.transfers || []).filter(t => t.confirmed !== true).length;
}

// 创建时把血统、疫苗、转让和最近成绩保存成快照
export function buildSnapshot(db, pigeon) {
  const father = db.pigeons.find(item => item.ringNo === pigeon.fatherRing) || null;
  const mother = db.pigeons.find(item => item.ringNo === pigeon.motherRing) || null;
  const races = [...(pigeon.races || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    ringNo: pigeon.ringNo,
    owner: pigeon.owner,
    color: pigeon.color,
    loft: pigeon.loft,
    pedigree: {
      fatherRing: pigeon.fatherRing || "",
      motherRing: pigeon.motherRing || "",
      father: father ? { ringNo: father.ringNo, color: father.color, loft: father.loft } : null,
      mother: mother ? { ringNo: mother.ringNo, color: mother.color, loft: mother.loft } : null
    },
    vaccines: (pigeon.vaccines || []).map(v => ({ ...v })),
    transfers: (pigeon.transfers || []).map(t => ({ ...t })),
    latestRace: races[0] ? { ...races[0] } : null
  };
}

// 根据资料完整度决定待审还是可出价
export function evaluateListing(db, pigeon) {
  const missingParentFields = missingParents(db, pigeon);
  const pendingTransferCount = unconfirmedTransfers(pigeon);
  const reasons = [];
  if (missingParentFields.length) reasons.push({ code: "parents_incomplete", details: missingParentFields });
  if (pendingTransferCount) reasons.push({ code: "transfer_unconfirmed", count: pendingTransferCount });
  return {
    status: reasons.length ? LISTING_STATUS.PENDING : LISTING_STATUS.BIDDABLE,
    reasons
  };
}

export function activeListing(db, ringNo) {
  return db.listings.find(
    l => l.ringNo === ringNo && l.status !== LISTING_STATUS.INVALIDATED
  ) || null;
}

// 同一足环只留一份有效挂牌；旧失效挂牌全部保留
export function createListing(db, pigeon) {
  if (activeListing(db, pigeon.ringNo)) throw new ListingError("active_listing_exists", 409);
  const now = new Date().toISOString();
  const verdict = evaluateListing(db, pigeon);
  const listing = {
    id: randomUUID(),
    ringNo: pigeon.ringNo,
    status: verdict.status,
    reviewReasons: verdict.reasons,
    snapshot: buildSnapshot(db, pigeon),
    bids: [],
    createdAt: now,
    invalidatedAt: null,
    invalidatedReason: null,
    changedFields: []
  };
  db.listings.unshift(listing);
  return listing;
}

function invalidate(listing, reason, changedFields = []) {
  if (listing.status === LISTING_STATUS.INVALIDATED) return false;
  listing.status = LISTING_STATUS.INVALIDATED;
  listing.invalidatedAt = new Date().toISOString();
  listing.invalidatedReason = reason;
  listing.changedFields = changedFields;
  return true;
}

// 档案修正会让挂牌失效，旧快照原样保留
export function invalidateByProfileChange(db, ringNo, changedFields) {
  const listing = activeListing(db, ringNo);
  if (!listing) return null;
  invalidate(listing, INVALID_REASON.PROFILE_CHANGED, changedFields);
  return listing;
}

// 鸽主撤牌：只动挂牌，鸽主资料不受影响
export function withdrawListing(db, listingId, owner) {
  const listing = db.listings.find(l => l.id === listingId);
  if (!listing) throw new ListingError("listing_not_found", 404);
  if (listing.status === LISTING_STATUS.INVALIDATED) throw new ListingError("listing_inactive", 409);
  if (owner != null && listing.snapshot.owner !== owner) throw new ListingError("not_owner", 403);
  invalidate(listing, INVALID_REASON.OWNER_WITHDREW);
  return listing;
}

// 只有可出价挂牌能公开出价；待审、已失效一律拒绝
export function placeBid(db, listingId, bidder, amount) {
  const listing = db.listings.find(l => l.id === listingId);
  if (!listing) throw new ListingError("listing_not_found", 404);
  if (listing.status === LISTING_STATUS.PENDING) throw new ListingError("listing_under_review", 409);
  if (listing.status === LISTING_STATUS.INVALIDATED) throw new ListingError("listing_inactive", 409);
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new ListingError("invalid_amount", 400);
  const top = listing.bids.length ? Math.max(...listing.bids.map(b => b.amount)) : 0;
  if (value <= top) throw new ListingError("bid_too_low", 409);
  const bid = { bidder: String(bidder || "").trim(), amount: value, at: new Date().toISOString() };
  if (!bid.bidder) throw new ListingError("bidder_required", 400);
  listing.bids.push(bid);
  return { listing, bid };
}

export function queryListings(db, status) {
  const list = [...db.listings].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return status ? list.filter(l => l.status === status) : list;
}
