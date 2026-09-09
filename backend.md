# Backend

本文档描述当前后端的真实结构、游戏模块接口，以及这次已完成的后台改造。

## 技术栈

- Express
- TypeScript
- mysql2
- Prisma
- JWT

## 目录重点

```text
backend/
├─ prisma/
│  ├─ schema.prisma
│  └─ schema.sql
├─ src/
│  ├─ controllers/
│  ├─ middleware/
│  ├─ routes/
│  ├─ services/
│  └─ main.ts
├─ migration_games_tables.sql
└─ package.json
```

## 运行方式

```bash
cd backend
npm install
npm run dev
```

构建：

```bash
npm run build
```

## 入口

主入口：`src/main.ts`

当前挂载的关键路由：

```ts
/api/auth
/api/posts
/api/parking-rush
/api/games
/api/admin/dashboard/stats
/api/admin/games
```

## 鉴权中间件

文件：`src/middleware/authMiddleware.ts`

### 规则

- `authMiddleware`
  - 必须有 `Authorization` 请求头
  - 必须携带合法 JWT
  - 否则返回 `401`

- `adminMiddleware`
  - 先跑 `authMiddleware`
  - 再检查 `req.user.role === 'admin'`
  - 不满足返回 `403`

### 401 的真实含义

后端这里没有明显逻辑错误。很多 401 其实是前端在未登录时访问了本来就需要登录的接口。

## 游戏模块

### 公共游戏接口

路由文件：`src/routes/gameRoutes.ts`

接口列表：

```text
GET  /api/games
GET  /api/games/:gameId/meta
POST /api/games/:gameId/view
GET  /api/games/:gameId/user-data
POST /api/games/:gameId/user-data
GET  /api/games/:gameId/leaderboard
POST /api/games/:gameId/sync
```

其中需要登录的接口：
- `GET /user-data`
- `POST /user-data`
- `POST /sync`

### 停车场专用接口

路由文件：`src/routes/parkingRush.ts`

接口列表：

```text
GET  /api/parking-rush/levels
GET  /api/parking-rush/levels/:levelNumber
POST /api/parking-rush/submit
GET  /api/parking-rush/leaderboard
GET  /api/parking-rush/progress
POST /api/parking-rush/difficulty
```

其中需要登录的接口：
- `POST /submit`
- `GET /progress`
- `POST /difficulty`

## 本轮新增的后台服务

### 1. 管理端游戏服务

文件：`src/services/adminGameService.ts`

新增能力：
- `getAdminGameList()`
- `updateGamePublishStatus(id, isPublished)`
- `incrementGameViewCount(slug)`
- `getDashboardStats()`

### 2. 管理端游戏控制器

文件：`src/controllers/adminGameController.ts`

负责：
- 仪表盘统计
- 小游戏列表
- 上架 / 下架切换

### 3. 管理端游戏路由

文件：`src/routes/adminGames.ts`

接口：

```text
GET /api/admin/dashboard/stats
GET /api/admin/games
PUT /api/admin/games/:id/publish
```

全部要求管理员权限。

## 仪表盘统计口径

当前 `getDashboardStats()` 统计：

- `posts`：文章总数
- `categories`：分类总数
- `comments`：评论总数
- `postViews`：文章浏览量汇总
- `gameViews`：小游戏浏览量汇总
- `totalViews`：文章浏览量 + 小游戏浏览量

## 小游戏展示控制

当前逻辑：

1. `GET /api/games` 只返回已上架游戏
2. 后台通过 `PUT /api/admin/games/:id/publish` 控制 `games.is_published`
3. 前端小游戏中心只展示上架数据

这已经满足“后台控制前台小游戏是否显示”的需求。

## 浏览量统计逻辑

前端进入游戏后调用：

```text
POST /api/games/:slug/view
```

服务端行为：

- 仅对已上架游戏增加 `view_count`
- 该值会进入后台仪表盘统计

## 数据库依赖

当前功能依赖这些字段已经存在：

表 `games`：
- `slug`
- `is_published`
- `view_count`
- `published_at`
- `sort_order`

表 `users`：
- `games_data`

表 `game_levels`：
- `game_id`
- `difficulty`
- `board_data`

表 `user_level_records`：
- 通关记录、星级、步数、完成时间

## 已定位的 401 原因

### 已修复

1. 前端开发环境 `baseURL` 配置异常
2. 停车场小游戏接口路径写错
3. 未登录时调用 `/games/:gameId/user-data`、`/parking-rush/progress` 等鉴权接口

### 需要区分的情况

以下 401 是正常的，不是后端 bug：

- 用户未登录访问 `user-data`
- 用户未登录保存停车场难度
- 用户 token 过期后访问后台接口

## 继续开发时的后端顺序

建议按这个顺序推进：

1. 设计新的游戏配置表或复用 `game_levels`
2. 后端先落接口和 SQL
3. 前端再改小游戏组件
4. 最后补管理后台配置入口

## 相关命令

```bash
cd backend
npm run dev
npm run build
```
