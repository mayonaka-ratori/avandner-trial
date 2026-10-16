# 黒絢のアヴァンドナー 体験版（avandner-trial）

TRPG『黒絢のアヴァンドナー』（著: 瀧里フユ ／ 発行: どらこにあん）の、
イベント会場向けソロ体験アプリです。QRコードからスマホで開き、
本編シナリオ「装甲列車救援依頼」を短縮した物語を 5〜10 分で遊べます。

英語の綴りは `avandner` です。保存済みの進行を読めるよう、保存用の内部名だけは従来の値を使います。

公開先は https://mayonaka-ratori.github.io/avandner-trial/ です。旧URLには移転案内を残しています。

> **人に配らないでください。** シナリオ本文とデータは 瀧里フユ／どらこにあん の著作物です。

## 仕組み

- **画面**: Vite + React 18 + TypeScript + Tailwind 4。GitHub Pages に公開
- **演出**: 「プレイヤーの視界＝アヴァンドナーの OS」という作り。
  起動シーケンス・タイプライター表示・システム警告帯・モニター質感
  （格子・走査線・周辺減光）は NieR:Automata の UI 作法を参考にしている。
  演出はすべて CSS と素の React で、追加ライブラリなし・音声なし
- **語り**: OpenAI API（既定 gpt-4o-mini）が場面の描写と自由入力への返答を生成。
  シナリオの進行と戦闘の判定はすべてアプリ側で行い、LLM は語り専用
- **中継**: `api/` の Vercel Functions が OpenAI を呼ぶ。キーはサーバーの環境変数にのみ置く
- **フォールバック**: 全場面に書き下ろしの予備文章があり、API・電波・Vercel の
  どれが死んでも最後まで遊べる
- **当日限定**: `TRIAL_ENABLED=false` で「体験終了」画面に切り替わる（キルスイッチ）

## コマンド

```bash
npm install
npm run dev        # http://localhost:5176/avandner-trial/
npm test -- --run  # テスト
npm run typecheck  # tsc --noEmit
npm run lint
npm run build      # dist/ に出力
npm run qr         # qr.png を生成
```

## 保守メモ

- `src/engine/judge.ts` と `src/engine/dice.ts` は `C:\tools\avandner-app`
  （本編ルール参照アプリ）からのコピーです。本家側に修正が入ったら
  こちらにも同じ修正を当ててください。逆にこちらで直したものを本家へ
  戻す必要が出たときも同様です

## 公開手順（当日までにやること）

詳しくは [docs/DEPLOY.md](docs/DEPLOY.md) を読んでください。概要は:

1. GitHub リポジトリ `mayonaka-ratori/avandner-trial` に push
2. リポジトリ Settings → Pages → Source を「GitHub Actions」に
3. Vercel にリポジトリを接続し、環境変数 `OPENAI_API_KEY`（と `TRIAL_ENABLED=true`）を設定
4. `npm run qr` で QR を生成して印刷
5. 終了後は Vercel の環境変数を `TRIAL_ENABLED=false` に
