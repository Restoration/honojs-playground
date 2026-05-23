# honojs-playground

Hono を異なるランタイム上で動かす検証用のモノレポ風プレイグラウンド。

## 構成

```
.
├── vercel/     # Vercel (Edge / Node Functions) 向けの Hono アプリ
├── lambda/     # AWS Lambda 向けの Hono アプリ
└── rest-api/   # ランタイム非依存のCRUDサンプル (node:sqlite + hono/validator)
```

ルート定義は各ディレクトリで独立しています。同じHonoでもランタイムごとにエントリポイント・ビルド・デプロイ手順が変わるため、混在を避けて分離しています。

## vercel/

Vercel の `api/` ファイルベースルーティング前提。

| 項目 | 内容 |
| --- | --- |
| エントリ | `vercel/api/index.ts` |
| 起動 | `cd vercel && npm install && npm run start`（= `vercel dev`） |
| デプロイ | `npm run deploy`（= `vercel`） |
| アダプタ | `hono/vercel` の `handle()`（Edge Runtime想定） |

詳細は [`vercel/README.md`](./vercel/README.md)。

## lambda/

AWS Lambda（API Gateway / Function URL）向け。ルート定義はランタイム非依存に切り出し、Lambdaエントリとローカル開発サーバの両方から再利用しています。

| 項目 | 内容 |
| --- | --- |
| ルート定義 | `lambda/src/app.ts`（ランタイム非依存） |
| Lambdaエントリ | `lambda/src/index.ts`（`hono/aws-lambda` の `handle()`） |
| ローカル起動 | `lambda/src/local.ts`（`@hono/node-server`） |
| 開発 | `cd lambda && npm install && npm run dev` → `http://localhost:3000` |
| ビルド | `npm run build`（esbuild で `dist/index.cjs` にバンドル） |
| パッケージング | `npm run package` → `function.zip` |

Lambda側のhandlerは `index.handler`、ランタイムは `nodejs20.x` を想定。API Gateway v1/v2/Function URLは `hono/aws-lambda` 側で自動判別されます。

詳細は [`lambda/README.md`](./lambda/README.md)。

## rest-api/

ランタイム非依存に CRUD パターンを示すための実装。SQLite (`node:sqlite`) で永続化し、バリデーションは Hono 標準の `validator()` を使う。

| 項目 | 内容 |
| --- | --- |
| ルート定義 | `rest-api/src/app.ts` |
| ローカル起動 | `cd rest-api && npm install && npm run dev` → `http://localhost:3000` |
| テスト | `npm test`(vitest, `:memory:` SQLite) |
| 永続化 | `node:sqlite`(既定 `./data.db`, `DATABASE_URL` で上書き可) |
| 必要 Node | **>= 22.5**(`node:sqlite`) |

詳細は [`rest-api/README.md`](./rest-api/README.md)。

## ルート対応表

| ディレクトリ | メソッド | パス | レスポンス |
| --- | --- | --- | --- |
| vercel / lambda | GET    | `/`             | テキスト挨拶 |
| vercel / lambda | GET    | `/entry/:id`    | ブログ記事(lambda側は実データ検索、vercel側はid返却のみ) |
| rest-api        | GET    | `/`             | `Hello Hono REST API!` |
| rest-api        | GET    | `/posts`        | 全件取得 |
| rest-api        | GET    | `/posts/:id`    | 1件取得 |
| rest-api        | POST   | `/posts`        | 作成 |
| rest-api        | PUT    | `/posts/:id`    | 全置換 |
| rest-api        | PATCH  | `/posts/:id`    | 部分更新 |
| rest-api        | DELETE | `/posts/:id`    | 削除 |

## ランタイム選定の指針

- **Vercel** — フロント寄せ・Edge配信・既存Next.js隣接プロジェクトと相性が良い。
- **Lambda** — AWSエコシステム内のサービス連携、IAM/VPC統合、SQS等のイベントトリガーが必要な場合。
- **rest-api** — ランタイムに縛られず CRUD + 永続化のパターンを確認したい場合。`app` をそのまま Vercel/Lambda のアダプタに渡せば横展開可能。
