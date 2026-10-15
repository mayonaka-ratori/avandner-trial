# 公開手順 — avandnar-trial

体験版をイベント当日に使える状態にする手順。作業はこの順で行う。

## 1. GitHub に push する

```bash
cd C:\tools\avandnar-trial
git init
git add -A
git commit -m "initial: 体験版アプリ"
gh repo create avandnar-trial --private --source=. --push
```

リポジトリは private でよい（GitHub Pages は private リポジトリでも
公開されるのは Pages の成果物だけ。ただし無料枠では private リポジトリの
Pages が使えないことがある。その場合は public にするか、Free プランの
制約を確認する）。

## 2. GitHub Pages を有効にする

1. リポジトリの **Settings → Pages**
2. **Source** を「GitHub Actions」にする
3. main へ push すると `.github/workflows/deploy.yml` が動き、
   `https://mayonaka-ratori.github.io/avandnar-trial/` に出る

## 3. Vercel に API を置く

1. Vercel にログイン → **Add New → Project**
2. `avandnar-trial` リポジトリを Import
3. Build の設定:
   - Framework Preset: **Vite**（そのままでよい。Vercel 側でもビルドされるが害はない）
4. **Environment Variables** に 2 つ設定:
   - `OPENAI_API_KEY` = OpenAI の API キー
   - `TRIAL_ENABLED` = `true`
   - （任意）`OPENAI_MODEL` = `gpt-4o-mini`（変更したいときだけ）
5. Deploy → `https://avandnar-trial.vercel.app/api/status` を開き、
   `{"enabled":true}` が返れば OK

画面側の API 呼び先は既定で `https://avandnar-trial.vercel.app`。
別名にした場合は build 時に環境変数 `VITE_API_BASE` を設定する
（GitHub Actions の build ステップに `env:` で渡す）。

## 4. 動作確認

- `https://mayonaka-ratori.github.io/avandnar-trial/` をスマホで開く
- 最初から最後まで通す（選択・自由入力・戦闘・リトライ・エンディング）
- 機内モードにしてリロード → 「簡易モード」のまま予備文章で最後まで遊べることを確認
- 予備文章で全文が読めるか、開発者モードで API を止めて確認する

## 5. QR コード

```bash
npm run qr
```

`qr.png` ができる。ブースのポップに印刷して貼る。

## 6. イベント終了後

- Vercel の環境変数 `TRIAL_ENABLED` を `false` に変更して Redeploy
  → 画面を開くと「イベント会場限定」の案内だけが出る
- 完全に止めたい場合は Vercel プロジェクトを削除し、Pages も無効化する

## 費用の目安

- OpenAI gpt-4o-mini: 1 回の体験あたり約 4,000 出力トークン。
  100 人が遊んでも数円〜十数円程度。心配なら OpenAI 側で月額上限を設定する
- Vercel Hobby・GitHub Pages: 無料枠で足りる想定
