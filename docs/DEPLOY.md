# 体験版の公開と当日の使い方

## 2026年10月17日の準備

公開先は https://mayonaka-ratori.github.io/avandner-trial/ です。
GitHub PagesからVercelに接続し、AIによる文章の生成を使います。
Vercelの公開先は https://avandner-trial.vercel.app/ です。
APIキーはVercelにだけ保存し、GitHubには公開先のURLだけを登録しています。
実際の返答生成と場面の文章生成を確認しました。テストは55件通りました。
通信に失敗した場合も、用意済みの文章で選択、自由入力、戦闘、エンディングまで進めます。
この場合、自由入力への返答にも用意済みの文章を使います。

ボタンの拡大、戦闘を始めるボタンの追加、文字の見やすさの調整も反映済みです。

## GitHub Pagesで更新する

`main` に変更を送ると、`.github/workflows/deploy.yml` が検査と公開を行います。
GitHubのActions画面で「Deploy to GitHub Pages」が成功したことを確認してください。

文章を生成するサーバーのURLを設定していない場合は、サーバーへの通信を行いません。
最初に長く待たされず、用意済みの文章で遊べます。
この状態では、Vercel側の終了設定も使いません。公開を止めるときはGitHubの
Settings → Pages → Unpublish siteを使ってください。

QRコードは次のコマンドで作れます。公開先を変えない限り、印刷済みのQRも使えます。

```powershell
npm run qr
```

`qr.png` が印刷用の画像です。

## 当日の確認

1. スマホのモバイル回線で公開先を開く。
2. 「物語をはじめる」から進み、選択肢、自由入力、戦闘を試す。
3. エンディングの「もう一度遊ぶ」で最初に戻れることを確かめる。

画面の読み込みにはインターネット接続が必要です。
通信を切った状態での再読み込みには対応していません。
文章を生成するサーバーが止まっても遊べることと、通信なしで画面を開けることは別です。

## AIによる文章の生成を追加する場合

1. Vercelで `mayonaka-ratori/avandner-trial` を取り込む。
2. 環境変数 `OPENAI_API_KEY` と `TRIAL_ENABLED=true` を設定して公開する。
3. Vercelでは `VITE_API_BASE` の設定は不要です。同じ公開先の `/api/` を呼びます。
4. `vercel.json` がVercel用のファイルの置き場所を指定します。画面は `/` で開けます。
5. Vercelの公開URLの `/api/status` が `{"enabled":true}` を返すことと、実際に文章が生成されることを確認する。
6. GitHubのSettings → Secrets and variables → Actions → Variablesに
   `VITE_API_BASE` を登録し、値にVercelの公開URLを入れる。末尾の `/` は付けない。
7. GitHub Actionsの「Deploy to GitHub Pages」を手動で実行する。

これでGitHub Pages側も文章の生成を使います。
APIキーはVercelにだけ置いてください。`VITE_` から始まる名前には入れないでください。

AIの文章生成を使う公開では、`TRIAL_ENABLED=false` に変えてVercelで再公開すると、
新しく開いた画面に終了案内が出ます。ただし、サーバーに接続できない場合は用意済みの文章で進めます。
確実に公開を止めたいときはGitHub Pagesも停止してください。

GitHub Pagesだけの形に戻すときは、GitHub側の `VITE_API_BASE` を削除し、再公開します。
