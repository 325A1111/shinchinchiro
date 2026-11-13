# セキュリティ設計・Strix (`usestrix/strix`) 連携ガイド

本アプリケーションは、AI自律ペネトレーションテストツール **[Strix (usestrix/strix)](https://github.com/usestrix/strix)** の検査観点（ビジネスロジックの改ざん耐性・API入力検証・HTTPセキュリティヘッダー・暗号学的乱数生成）に基づき設計・強化されています。

## 実装済みセキュリティ対策（Server-Authoritative Architecture）

1. **サーバー権威型ゲームロジック (`server.ts`)**
   - サイコロの出目生成・振り直し回数上限（最大3回）・賭け金検証・所持金残高・勝敗精算をすべてサーバー側で実行し、クライアント側からのメモリ改ざんや不正リクエストによるチートを防止しています。
2. **暗号学的擬似乱数生成器（CSPRNG）**
   - サーバー側の出目判定に Node.js `crypto.randomInt(1, 7)` を使用し、剰余バイアスおよび `Math.random()` 予測脆弱性を排除しています。
   - クライアント側の演出用乱数も `crypto.getRandomValues`（棄却サンプリング）へ移行しています。
3. **HMAC-SHA256 セッション整合性保護 & Cookie 属性**
   - セッションIDに `crypto.randomBytes(32)` と HMAC-SHA256 署名（定数時間比較 `crypto.timingSafeEqual`）を適用し、セッション偽造を防止しています。
4. **入力検証・プロトタイプ汚染防御・レート制限**
   - JSONボディサイズ上限（`16kb`）、`__proto__` / `constructor` / `prototype` キーの再帰的拒否、賭け金および設定値の厳格なホワイトリスト検証、`/api/*` エンドポイントへのスライディングウィンドウ方式レート制限（429応答）を実装しています。
5. **HTTP セキュリティヘッダー**
   - `Content-Security-Policy`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`、`Cross-Origin-Resource-Policy: same-origin`、`Cache-Control: no-store`（API応答）、および `X-Powered-By` 無効化を設定しています。

## Strix (`usestrix/strix`) による継続的ペネトレーションテスト

### 1. GitHub Actions での自動実行
`.github/workflows/strix-security.yml` が設定済みです。GitHub リポジトリの `Settings > Secrets and variables > Actions` に以下を登録すると、PR作成時・`main` ブランチへのプッシュ時・手動実行時に Strix が自動実行されます。

- `LLM_API_KEY`: Strix が利用する LLM プロバイダの API キー
- `STRIX_LLM`（任意）: 利用するモデル指定（例: `openai/gpt-4o` 等）

### 2. ローカル環境での Strix 実行方法
Docker と LLM API キーが利用可能な環境で以下を実行します。

```bash
curl -sSL https://strix.ai/install | bash

export STRIX_LLM="openai/gpt-4o"
export LLM_API_KEY="YOUR_LLM_API_KEY"

# ソースコード静的・ホワイトボックステスト
strix -n -t ./ --scan-mode quick

# 起動中のローカル/ステージングURLに対する動的ペネトレーションテスト
strix -n -t http://localhost:3000 --scan-mode standard
```
