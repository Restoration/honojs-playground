# rest-api

Hono で書くシンプルな CRUD のリファレンス実装。SQLite (Node 組み込みの `node:sqlite`) で永続化、バリデーションは Hono 標準の `validator()`、テストは vitest + `app.request()`。

ランタイム特化(Vercel/Lambda)のアダプタは付けていません。`app.ts` は `app.fetch` をそのまま使えるので、必要なランタイムから import して薄いエントリだけ書けば乗せ替え可能です。

## ディレクトリ構成

```
rest-api/
├── src/
│   ├── app.ts        # Hono ルート定義 (CRUD)
│   ├── db.ts         # node:sqlite 初期化 (シングルトン)
│   ├── store.ts      # posts テーブルへの CRUD 関数
│   └── server.ts     # @hono/node-server で http://localhost:3000 を起動
├── tests/
│   └── app.test.ts   # app.request() で全エンドポイント検証
├── vitest.config.ts  # テスト時 DATABASE_URL=:memory: を注入
├── tsconfig.json
└── package.json
```

## 前提

- Node.js **22.5 以上**(`node:sqlite` を使うため)。Node 22.5〜23 では実行時に `ExperimentalWarning: SQLite` が出ますが動作には影響なし。Node 24 以降では安定。

## セットアップ

```bash
cd rest-api
npm install
```

## 起動

```bash
npm run dev        # tsx watch で src/server.ts
# → Hono REST API listening on http://localhost:3000
```

`PORT` 環境変数で待受ポート変更、`DATABASE_URL` で DB ファイル指定(既定 `./data.db`、`:memory:` も可)。

```bash
PORT=8787 DATABASE_URL=./posts.db npm run dev
```

## エンドポイント

| Method | Path | 内容 | Status |
| --- | --- | --- | --- |
| GET    | `/`             | ヘルスチェック (`Hello Hono REST API!`) | 200 |
| GET    | `/posts`        | 全件取得 (`created_at DESC`) | 200 |
| GET    | `/posts/:id`    | 1件取得 | 200 / 404 |
| POST   | `/posts`        | 作成 (`{title, content}`) | 201 / 400 |
| PUT    | `/posts/:id`    | 全置換 (`{title, content}`) | 200 / 404 / 400 |
| PATCH  | `/posts/:id`    | 部分更新 (`title?`, `content?`) | 200 / 404 / 400 |
| DELETE | `/posts/:id`    | 削除 | 204 / 404 |

`id` はサーバ側で `crypto.randomUUID()` 採番。`createdAt` / `updatedAt` は `Date.now()` の epoch ms。

### 動作確認

```bash
# 作成
curl -X POST http://localhost:3000/posts \
  -H 'content-type: application/json' \
  -d '{"title":"hello","content":"world"}'

# 一覧
curl http://localhost:3000/posts

# 1件
curl http://localhost:3000/posts/<id>

# 部分更新
curl -X PATCH http://localhost:3000/posts/<id> \
  -H 'content-type: application/json' \
  -d '{"title":"updated"}'

# 削除 (204 No Content)
curl -i -X DELETE http://localhost:3000/posts/<id>
```

## スキーマ

`db.ts` が起動時に CREATE TABLE IF NOT EXISTS:

```sql
CREATE TABLE IF NOT EXISTS posts (
  id         TEXT    PRIMARY KEY,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

ファイル DB の場合のみ `PRAGMA journal_mode = WAL`。

## バリデーション方針

`hono/validator` を使い、`validator('json', fn)` の `fn` で型・必須チェックを書き、失敗時に `c.json({error}, 400)` を返す。zod 等の依存なし。

- `POST` / `PUT`: `title` と `content` の両方が必須の非空文字列
- `PATCH`: 少なくとも片方が必要。指定したフィールドは非空文字列

## テスト

```bash
npm test           # 1回実行
npm run test:watch # 監視
```

- `vitest.config.ts` で `DATABASE_URL=:memory:` を注入してファイル汚染を回避
- `beforeEach(clearPosts)` で各テスト前にテーブルをクリア
- `app.request(url, init)` でルータを直接叩く(Node サーバ不要)

## 設計メモ

- **`db.ts` のシングルトン化**: `getDb()` 初回呼出で接続を開き以降は使い回す。`process.env.DATABASE_URL` は初回時にしか読まないので、テストでは vitest config 経由で事前に注入する。
- **`node:sqlite` の動的 import**: vitest 2 (Vite) が `node:sqlite` の URL を解決できないため、`src/db.ts` では `createRequire` 経由で読み込んでいる。tsx / Node ランタイムでは透過的に動く。
- **PATCH の戻り値**: 既存値とマージしたフル `Post` を返す(差分だけではない)。

## 他ディレクトリとの関係

| ディレクトリ | 主眼 |
| --- | --- |
| `../vercel` | Vercel Functions(Edge)上で Hono を動かす |
| `../lambda` | AWS Lambda 上で Hono を動かす + ローカル Lambda エミュレータ |
| `rest-api` (これ) | ランタイム非依存に CRUD + 永続化のパターンを示す |

`src/app.ts` の `export const app` はランタイム非依存なので、Vercel/Lambda 側から `import { app } from "../../rest-api/src/app"` のように取り込んで、各ランタイムのアダプタで包めば横展開可能。
