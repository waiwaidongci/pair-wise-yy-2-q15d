# 赛鸽拍卖挂牌站

拍卖季挂牌工具：鸽主登记档案后可创建拍卖挂牌，系统在创建瞬间保存血统、疫苗、转让和最近成绩的快照。

```bash
npm start
```

访问 `http://localhost:3024`。

## 挂牌规则

- **同一足环仅一份有效挂牌**：已有待审或可出价挂牌时不能再次创建；撤牌或因档案修正失效后可重新挂牌，旧记录全部保留。
- **可出价（open）**：父母足环均已填写且对应档案在册，并且最近一次转让已确认。
- **待审（pending）**：父母资料不全，或最近一次转让未确认。待审挂牌公开展示快照，但不能出价。
- **已失效（invalid）**：
  - `profile_amended` — 鸽只档案被修正（资料字段、新增疫苗/成绩/转让、确认转让等），有效挂牌立即失效，创建时的旧快照原样保留；
  - `owner_withdrawn` — 鸽主主动撤牌，鸽只档案与快照都不受影响。
- 转让录入后为“未确认”，鸽主暂不变更；确认后鸽主变为受让方。

## 分层

- `src/store.js`：JSON 文件读写与旧数据迁移，只负责存储。
- `src/domain.js`：挂牌资格判断、快照生成、失效/撤牌/报价等业务规则。
- `server.js`：HTTP 路由与页面操作，不包含业务判断。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/pigeons` | 鸽只列表 |
| POST | `/api/pigeons` | 创建鸽只档案 |
| PATCH | `/api/pigeons/:ring` | 修正档案（使有效挂牌失效） |
| GET | `/api/pigeons/:ring/relation` | 血统关系（含当前有效挂牌） |
| POST | `/api/pigeons/:ring/transfers` | 录入转让（未确认） |
| POST | `/api/pigeons/:ring/transfers/:index/confirm` | 确认转让 |
| POST | `/api/pigeons/:ring/vaccines` | 录入疫苗 |
| POST | `/api/pigeons/:ring/races` | 录入归巢成绩 |
| POST | `/api/pigeons/:ring/listings` | 创建挂牌（自动判定待审/可出价） |
| GET | `/api/listings?status=all|pending|open|invalid` | 挂牌列表，按状态筛选 |
| POST | `/api/listings/:id/withdraw` | 鸽主撤牌 |
| POST | `/api/listings/:id/bids` | 对可出价挂牌提交报价（其他状态返回 409） |
