# honojs-playground

Hono を異なるランタイム上で動かす検証用のモノレポ風プレイグラウンド。

## 構成

```
.
├── vercel/   # Vercel (Edge / Node Functions) 向けの Hono アプリ
└── lambda/   # AWS Lambda 向けの Hono アプリ
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

## ルート対応表

| メソッド | パス | レスポンス |
| --- | --- | --- |
| GET | `/` | テキスト挨拶 |
| GET | `/entry/:id` | ブログ記事（lambda側は実データ検索、vercel側はid返却のみ） |

## ランタイム選定の指針

- **Vercel** — フロント寄せ・Edge配信・既存Next.js隣接プロジェクトと相性が良い。
- **Lambda** — AWSエコシステム内のサービス連携、IAM/VPC統合、SQS等のイベントトリガーが必要な場合。
