# 赛鸽拍卖挂牌站

运行：

```bash
npm start
```

访问 `http://localhost:3024`。

## 功能

- 鸽只档案：足环登记、血统父母查询、疫苗、转让、归巢成绩。
- 拍卖挂牌：
  - 同一足环只保留一份有效挂牌（待审 / 可出价）；已失效挂牌永久保留。
  - 创建挂牌时把血统、疫苗、转让、最近成绩冻结成快照，买家看到的就是挂牌时的资料。
  - **待审**：父母资料不全（足环未填或父母档案未登记）或存在未确认转让，不能公开出价。
  - **可出价**：资料齐全且转让均已确认，买家可公开出价。
  - 档案修正（改资料、追加疫苗/成绩、新增或确认转让）会让有效挂牌失效，旧快照保留，需重新挂牌重新审核。
  - 鸽主撤牌只让挂牌失效，鸽只档案完全不受影响。
- 挂牌列表支持按 待审 / 可出价 / 已失效 筛选。

## 结构

- `store.js`：数据保存（读写 `data/pigeons.json`），不含规则。
- `listings.js`：挂牌判断与领域逻辑（快照、待审、失效、出价）。
- `page.js`：页面操作（HTML 与前端交互）。
- `server.js`：HTTP 路由，把请求分派给上面三层。

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/listings?status=pending\|biddable\|invalidated` | 挂牌列表，可按状态筛 |
| POST | `/api/pigeons/:ringNo/listings` | 创建挂牌（资料不齐自动落为待审） |
| POST | `/api/listings/:id/bids` | 对可出价挂牌出价 |
| POST | `/api/listings/:id/withdraw` | 鸽主撤牌 |
| PATCH | `/api/pigeons/:ringNo` | 档案修正，原有效挂牌失效 |
| POST | `/api/pigeons/:ringNo/transfers/:index/confirm` | 确认一条转让 |
