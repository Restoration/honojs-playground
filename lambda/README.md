# lambda

AWS Lambda 上で動かす Hono アプリ。**ローカルでLambdaの挙動を再現して開発する仕組み**を中心に整備しています。

## ディレクトリ構成

```
lambda/
├── src/
│   ├── app.ts              # Honoアプリ（ランタイム非依存）
│   ├── index.ts            # Lambdaエントリ: handle(app) を export const handler
│   ├── local.ts            # ローカル開発: 素のHono on Node（最速・Lambda層なし）
│   ├── lambda-emulator.ts  # ローカル開発: Lambda再現エミュレータ（実handlerを呼ぶ）
│   └── invoke.ts           # 単発イベント実行CLI（aws lambda invoke 相当）
├── events/                 # サンプルイベント（APIGW v1/v2 / Function URL）
├── tsconfig.json
└── package.json
```

## ローカル開発の3モード

用途別に3つのモードを使い分けます。

| モード | コマンド | Lambda再現度 | 速度 | 用途 |
| --- | --- | --- | --- | --- |
| **Native** | `npm run dev` | ✗ Honoのみ | ⚡最速 | ルート確認・UIプロトタイプ |
| **Emulator** | `npm run dev:emulator` | ◎ event/context/timeout | 速 | Lambda挙動の検証・統合テスト |
| **Invoke (one-shot)** | `npm run invoke -- <event.json>` | ◎ | 速 | 単一イベントのデバッグ・スナップショット検証 |
| **SAM CLI** | `sam local start-api` | ◎◎ Dockerで実Lambda runtime | 遅 | 本番にどこまでも近づけたい時 |

### モード1: Native（最速）

`src/local.ts` が `@hono/node-server` で起動。**Lambdaの層を通らず素のHonoをNodeで動かす**ので最も速い。

```bash
npm install
npm run dev
# → http://localhost:3000
```

#### 動作確認

```bash
curl http://localhost:3000/
curl http://localhost:3000/entry/1
```

#### 適性

- ルート定義の試行錯誤
- レスポンスJSONの形を確認したい時
- ホットリロードで素早く反復したい時

#### 限界

- `event` / `context` を介していないため、Lambda固有のロジック（`getRemainingTimeInMillis()` を見る、`event.requestContext` を参照する、cookies配列を扱う等）の検証はできません。

### モード2: Emulator（推奨）

`src/lambda-emulator.ts` が HTTPサーバとして待ち受け、**リクエストを `APIGatewayProxyEventV2` に変換 → 実 `handler`（`hono/aws-lambda` の `handle()`）を呼ぶ → 戻り値の `{ statusCode, headers, body }` をHTTPレスポンスに復元**します。本物のLambdaと**同じコードパス**を通します。

```bash
npm run dev:emulator
# → http://localhost:3000
#   Lambda emulator listening on http://localhost:3000
#     function     : hono-playground
#     timeout      : 3000 ms
#     memory       : 128 MB
```

#### 再現している項目

| 項目 | 内容 |
| --- | --- |
| イベント形式 | `APIGatewayProxyEventV2`（v2.0、`rawPath`/`rawQueryString`/`requestContext.http` 等を組み立て） |
| Context | `awsRequestId` (UUID) / `functionName` / `memoryLimitInMB` / `invokedFunctionArn` / `logGroupName` / `logStreamName` |
| `getRemainingTimeInMillis()` | 起動時刻からの経過で残り時間を返す |
| タイムアウト | `LAMBDA_TIMEOUT_MS` 超過で `Task timed out after Ns` を502で返す |
| Cold start | 初回呼び出しのみログに `(cold start)` を付与。`LAMBDA_COLD_START_MS` で遅延も注入可 |
| バイナリ | non-text の Content-Type は `isBase64Encoded: true` でbase64エンコード |
| Cookie | `cookies: string[]` に分解、レスポンス側の `cookies` も `Set-Cookie` ヘッダに展開 |
| CloudWatch風ログ | `START` / `END` / `REPORT RequestId: ... Duration: ... ms` |

#### 環境変数

| 変数 | 既定値 | 内容 |
| --- | --- | --- |
| `PORT` | `3000` | 待受ポート |
| `LAMBDA_TIMEOUT_MS` | `3000` | タイムアウト |
| `LAMBDA_MEMORY_MB` | `128` | `memoryLimitInMB` の値 |
| `LAMBDA_FUNCTION_NAME` | `hono-playground` | 関数名（ARN・ロググループ生成に利用） |
| `LAMBDA_COLD_START_MS` | `0` | 初回呼び出しに追加で待たせるms |

#### 動作確認例

```bash
# 通常呼び出し
curl http://localhost:3000/entry/1

# タイムアウトを短くして挙動確認
LAMBDA_TIMEOUT_MS=50 npm run dev:emulator

# cold start を1秒擬似
LAMBDA_COLD_START_MS=1000 npm run dev:emulator
```

ターミナルには本物のLambdaに近い形のログが出ます：

```
START RequestId: 7b2a... Version: $LATEST  (cold start)
END RequestId: 7b2a...
REPORT RequestId: 7b2a...	Duration: 14 ms	Memory Size: 128 MB
```

#### 限界（既知）

- **コンテナ隔離なし** — Node.jsプロセスは同一なので、メモリ制限・FS隔離・ネットワーク分離は再現しません。
- **タイムアウト後もhandlerは裏で走り続ける** — 本物のLambdaはタイムアウトでプロセスごと殺されますが、エミュレータは `Promise.race` で外側だけ切ります。そのため、長時間動くhandlerが共有状態（モジュールスコープのキャッシュなど）を後から書き換える可能性があります。`worker_threads` を介さない限り原理的に解消不能なので、テスト時はhandler内のロジックを冪等に保つこと。
- **IAM / VPC は対象外** — 必要なら `.env` で環境変数だけ代用。
- **完全に本物に寄せたい場合は SAM CLI / Lambda RIE**（後述）。

### モード3: 単発イベント実行（`npm run invoke`）

`aws lambda invoke` のローカル版です。JSONイベントを1つだけ流して終了します。スナップショットテストやデバッガアタッチに最適。

```bash
npm run invoke -- events/apigw-v2-get-entry.json
```

出力例：

```
START RequestId: 8a1f-...
END RequestId: 8a1f-...
REPORT RequestId: 8a1f-...	Duration: 9 ms	Memory: 128 MB
--- response ---
{
  "statusCode": 200,
  "headers": { "content-type": "application/json; charset=UTF-8" },
  "body": "{\"id\":\"1\",\"title\":\"blog1\",\"content\":\"content1\"}"
}
```

#### 同梱サンプルイベント

| ファイル | 内容 |
| --- | --- |
| `events/apigw-v2-get-root.json` | API Gateway HTTP API（v2）から `GET /` |
| `events/apigw-v2-get-entry.json` | 同 v2 から `GET /entry/1` |
| `events/apigw-v2-get-entry-notfound.json` | 同 v2 から `GET /entry/999`（404確認） |
| `events/apigw-v1-get-entry.json` | API Gateway REST API（v1）形式 |
| `events/function-url-get-entry.json` | Lambda Function URL 形式（v2と同形） |

`hono/aws-lambda` の `handle()` はこれら3形式を自動判別するため、コード変更なしで全部通ります。

#### デバッグアタッチ

VS Code 等から Node.js デバッガを `tsx` プロセスにアタッチすればブレークポイントが効きます。`package.json` の `scripts.invoke` を `node --inspect-brk --import tsx src/invoke.ts` 風に差し替える運用が手軽です。

### モード4: AWS SAM CLI でLambda Runtime を実コンテナで動かす

最も本番に近い再現が欲しい場合。Docker と [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) をインストール後：

```yaml
# template.yaml （ルートに作成）
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Resources:
  HonoFn:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./dist
      Handler: index.handler
      Runtime: nodejs20.x
      Timeout: 3
      MemorySize: 128
      Events:
        Proxy:
          Type: HttpApi
          Properties:
            Path: /{proxy+}
            Method: ANY
```

```bash
npm run build              # dist/index.cjs を生成
sam local start-api        # Docker内のLambda Runtime で http://localhost:3000 を待受
```

> **Note**: `CodeUri: ./dist` を指定しているため、SAMはビルド成果物（`dist/index.cjs`）を直接マウントします。`function.zip` は `aws lambda update-function-code` でデプロイする時用で、`sam local` では使いません。

#### 単発実行（SAM）

```bash
sam local invoke HonoFn -e events/apigw-v2-get-entry.json
```

### モード5: Lambda Runtime Interface Emulator (RIE)

AWS公式の最小ランタイムエミュレータ。SAM不要、Dockerだけで動きます。

```bash
npm run build
docker run --rm -p 9000:8080 \
  -v "$PWD/dist":/var/task \
  public.ecr.aws/lambda/nodejs:20 \
  index.handler

# 別ターミナルから
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d @events/apigw-v2-get-entry.json
```

エンドポイント `/2015-03-31/functions/function/invocations` がRIEの固定パス。実Lambdaが内部で叩いているのと同じインタフェース。

## モード選択フローチャート

```
ルートやレスポンスJSONを触るだけ           → Native
event/context/timeoutを検証したい         → Emulator
1イベント流して結果を見たい / CI で回したい → Invoke
本番ランタイムの完全再現が欲しい           → SAM CLI または RIE
```

## ビルド・パッケージング・デプロイ

### ビルド

```bash
npm run build
# → dist/index.cjs （単一ファイル、依存バンドル済み）
```

esbuild オプション：
- `--platform=node --target=node20`
- `--format=cjs`（Lambda Node20 互換）
- `--bundle`（hono含め1ファイルに同梱）

### zip 化

```bash
npm run package
# → function.zip
```

### Lambda へのアップロード

```bash
# 初回
aws lambda create-function \
  --function-name hono-playground \
  --runtime nodejs20.x \
  --role arn:aws:iam::<ACCOUNT_ID>:role/<LAMBDA_EXEC_ROLE> \
  --handler index.handler \
  --zip-file fileb://function.zip

# 更新
aws lambda update-function-code \
  --function-name hono-playground \
  --zip-file fileb://function.zip
```

### Function URL を有効化

`aws lambda create-function-url-config` でAPI Gatewayなしに `https://<id>.lambda-url.<region>.on.aws/` を発行可能。

### API Gateway を前段に置く

「Lambdaプロキシ統合」を選択。v1 / v2 どちらも `hono/aws-lambda` 側で自動判別されるため、コード変更不要。

## ハンドラ設定

| 項目 | 値 |
| --- | --- |
| Runtime | `nodejs20.x` |
| Handler | `index.handler` |
| Architecture | x86_64 / arm64 |

## スクリプト一覧

| script | 用途 |
| --- | --- |
| `npm run dev` | Native（素のHono on Node） |
| `npm run dev:emulator` | Lambda エミュレータ |
| `npm run invoke -- <event.json>` | 単発イベント実行 |
| `npm run build` | esbuild バンドル → `dist/index.cjs` |
| `npm run package` | build → zip 化 |

## ルート一覧

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/` | `Hello Hono on Lambda!` |
| GET | `/entry/:id` | `blogPosts` から該当を返す。無ければ404 |

## Vercel 版との対比

| | vercel/ | lambda/ |
| --- | --- | --- |
| エントリ | `api/index.ts` | `src/index.ts`（`handle(app)`） |
| ローカル開発 | `vercel dev` | Native / Emulator / Invoke / SAM / RIE |
| ビルド | Vercel CLI が処理 | esbuild で自前 |
| デプロイ | `vercel` | zip + AWS CLI / IaC |
| イベント検証 | 不可（HTTPのみ） | サンプルイベントを直接 `invoke` 可能 |
