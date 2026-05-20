# vercel

Vercel上で動かすHonoアプリ。`api/` ディレクトリ配下のファイルが自動的にVercel Functionとして公開されます。

## ディレクトリ構成

```
vercel/
├── api/
│   └── index.ts      # Honoアプリ本体（Vercel Function）
├── public/
│   └── favicon.ico
├── vercel.json       # /api/* を /api にリライト
├── tsconfig.json
└── package.json
```

## 前提

- Node.js 18 以上
- Vercel アカウント（デプロイする場合）

## セットアップ

```bash
cd vercel
npm install
```

## 開発（ローカル起動）

```bash
npm run start
```

内部的に `vercel dev` が走り、 `http://localhost:3000` で待ち受けます。
ルートは `vercel.json` の rewrite により全て `api/index.ts` に集約されます。

### 動作確認

```bash
curl http://localhost:3000/
# → Hello Hono!

curl http://localhost:3000/entry/1
# → { "you id is": "1" }
```

## デプロイ

```bash
npm run deploy
```

初回は Vercel CLI からプロジェクトのリンク（既存／新規）を聞かれます。以降は `vercel --prod` で本番デプロイ可能。

## ルート一覧

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/` | `Hello Hono!` を返す |
| GET | `/entry/:id` | 受け取った `id` を JSON で返す |

## 現状の注意点

- `api/index.ts` は **`export default` が無い**ため、現状のままでは `vercel dev` がFunctionとして認識できません。Vercel上で動作させる場合は次のいずれかが必要です：
  - `hono/vercel` の `handle()` を使う：
    ```ts
    import { handle } from "hono/vercel";
    export const config = { runtime: "edge" };
    export default handle(app);
    ```
  - もしくは Node Runtime 用に `export default app.fetch` などへ差し替える
- `blogPosts` は宣言されているだけで未使用です（`/entry/:id` は単にidをそのまま返す実装）。

## アダプタについて

`hono/vercel` には以下のRuntime向けアダプタが用意されています：

- **Edge Runtime** — `export const config = { runtime: "edge" }` を併用
- **Node.js Runtime** — config 指定なし（デフォルト）

Lambda版（`../lambda`）はビルド〜zip化までを自前で行いますが、Vercel版はCLIが全て処理するため、デプロイ手順は最も簡単です。
