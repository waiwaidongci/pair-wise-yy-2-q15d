import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data", "pigeons.json");

const seed = {
  pigeons: [
    {
      ringNo: "CHN-2026-001",
      owner: "北岸棚",
      fatherRing: "CHN-2022-188",
      motherRing: "CHN-2023-512",
      color: "灰",
      loft: "北岸A棚",
      vaccines: [{ date: "2026-04-01", name: "新城疫" }],
      transfers: [{ date: "2026-04-15", from: "育种棚", to: "北岸棚", confirmed: true }],
      races: [{ date: "2026-06-01", event: "120公里训放", distance: 120, returnTime: "10:42", rank: 18 }],
    },
    { ringNo: "CHN-2022-188", owner: "育种棚", fatherRing: "", motherRing: "", color: "雨点", loft: "种鸽棚", vaccines: [], transfers: [], races: [] },
    { ringNo: "CHN-2023-512", owner: "育种棚", fatherRing: "", motherRing: "", color: "红轮", loft: "种鸽棚", vaccines: [], transfers: [], races: [] },
  ],
  listings: [
    {
      id: "L-1001",
      ringNo: "CHN-2026-001",
      status: "open",
      createdAt: "2026-08-20T09:00:00.000Z",
      snapshot: {
        ringNo: "CHN-2026-001",
        owner: "北岸棚",
        pedigree: { fatherRing: "CHN-2022-188", fatherFound: true, motherRing: "CHN-2023-512", motherFound: true },
        vaccines: [{ date: "2026-04-01", name: "新城疫" }],
        transfers: [{ date: "2026-04-15", from: "育种棚", to: "北岸棚", confirmed: true }],
        races: [{ date: "2026-06-01", event: "120公里训放", distance: 120, returnTime: "10:42", rank: 18 }],
        latestRace: { date: "2026-06-01", event: "120公里训放", distance: 120, returnTime: "10:42", rank: 18 },
      },
      bids: [],
      invalidReason: "",
      invalidatedAt: "",
      withdrawnAt: "",
    },
  ],
};

// 旧数据迁移：补上转让确认标记和挂牌集合
function migrate(db) {
  let dirty = false;
  if (!Array.isArray(db.pigeons)) {
    db.pigeons = [];
    dirty = true;
  }
  for (const pigeon of db.pigeons) {
    for (const key of ["vaccines", "transfers", "races"]) {
      if (!Array.isArray(pigeon[key])) {
        pigeon[key] = [];
        dirty = true;
      }
    }
    for (const transfer of pigeon.transfers) {
      if (typeof transfer.confirmed !== "boolean") {
        transfer.confirmed = true; // 升级前的历史转让视为已确认
        dirty = true;
      }
    }
  }
  if (!Array.isArray(db.listings)) {
    db.listings = [];
    dirty = true;
  }
  return dirty;
}

// 存储层：只负责读写与结构迁移，不做业务判断
export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
    return structuredClone(seed);
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  if (migrate(db)) await writeFile(dbPath, JSON.stringify(db, null, 2));
  return db;
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}
