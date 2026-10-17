/**
 * api/narrate.ts — OpenAI への中継
 *
 * 画面（GitHub Pages）から場面キーを受け取り、場面ごとの指示を
 * システムプロンプトとして組み立てて OpenAI に投げ、語りの文を返す。
 *
 * 設計上の決まり:
 *   - OpenAI のキーはここ（環境変数）にだけ置く。ブラウザには出さない
 *   - シナリオの進行はアプリ側の仕事。ここは「語り」と「自由入力への返答」
 *     だけを生成する。場面キーは許可リストで検証する
 *   - TRIAL_ENABLED=false で全部 403（イベント終了後のキルスイッチ）
 *   - 失敗したら 5xx を返すだけ。画面側は予備文章に切り替える
 */

export const config = { runtime: "edge" };

const ALLOWED_ORIGINS = [
  "https://mayonaka-ratori.github.io",
  "http://localhost:5176",
  "http://localhost:4173",
];

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_OUTPUT_TOKENS = 600;
const MAX_FREE_INPUT = 200;
const OPENAI_TIMEOUT_MS = 15_000;

/*
 * 簡易レート制限。インスタンス内メモリのベストエフォートで、
 * edge の isolate をまたいでは共有されない。curl 等の連打から
 * OpenAI 課金を守る抑止であって、本番の防衛線は OpenAI 側の
 * 利用上限設定（DEPLOY.md 参照）。
 * 1 回の体験でこの API は 8〜10 回呼ばれる想定。
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 30;
const RATE_MAX_TOTAL = 300;
const rateState = {
  resetAt: 0,
  total: 0,
  perIp: new Map<string, number>(),
};

function allowRequest(ip: string): boolean {
  const now = Date.now();
  if (now >= rateState.resetAt) {
    rateState.resetAt = now + RATE_WINDOW_MS;
    rateState.total = 0;
    rateState.perIp.clear();
  }
  rateState.total += 1;
  const count = (rateState.perIp.get(ip) ?? 0) + 1;
  rateState.perIp.set(ip, count);
  return count <= RATE_MAX_PER_IP && rateState.total <= RATE_MAX_TOTAL;
}

const COMMON_PROMPT = `あなたはTRPG『黒絢のアヴァンドナー』（ハイマニューバ傭兵少女TRPG）の体験版シナリオの語り部です。

世界観: 企業戦争後の荒廃した地上。プレイヤーは「アヴァンドナー」――培養脳を持つ機械の身体の少女で、新人の傭兵。物語は「装甲列車救援依頼」: イーフェアンダーグラウンドからC3アンダーグラウンドへ帰る装甲列車を、渓谷に潜む巨大兵器エグゾーストフォートレス「ザイラ」から救う任務。

ルール:
- 日本語で書く。長さは指定に従う
- プレイヤーを「あなた」と呼ぶ二人称の地の文か、NPCの台詞
- シナリオの結末や設定の核心（ガブリエッラの正体など）を先に明かさない
- プレイヤーの行動を決めつけない。返答はその場の空気を作るだけ
- メタな発言（「AIとして」等）をしない。作品世界の中だけで書く
- 出力は指定された文だけ。前後に説明を付けない`;

/** 場面キー → 生成指示。画面側 scenes.ts の narrationKey／reply-<id> と対応する */
export const SCENE_PROMPTS: Record<string, string> = {
  awakening: `場面: 促成培養槽から新人アヴァンドナーが目覚める直前。夢の中の草原で、育ての親ニームハインが別れを告げる。その後培養槽が開き、迎えに来た「姉貴分」（面倒見のいい傭兵の先輩）と対面する。
出力: この場面の描写を3〜4段落・計200〜280字で。ニームハインの穏やかで少しお茶目な別れの台詞を含めること。`,
  "reply-awakening": `場面: 目覚めたばかりの新人（プレイヤー）が、迎えに来た姉貴分に第一声をかけた。プレイヤーの入力がその言葉。
出力: 姉貴分の返答を台詞（「」付き）＋短い地の文で計80〜150字で。面倒見がよく、少しふざける口調。プレイヤーの言葉に必ず応答すること。`,
  city: `場面: C3アンダーグラウンドの街を、明るく世話焼きな少女ロレッタ（傭兵団に入り浸る一般人）が新人を連れて見て回る。終わりにパブ「スターダスト」に着く。
出力: 散策の描写とロレッタのはしゃいだ台詞を含めて3〜4段落・計200〜280字で。`,
  pub: `場面: パブ「スターダスト」。看板娘ステラが「明日、兄の乗る装甲列車がイーフェから帰ってくる」と嬉しそうに話す。
出力: 場面の描写とステラの明るい台詞（お土産の魚への期待を含める）を3〜4段落・計180〜260字で。`,
  gabriella: `場面: ステラが去った直後、四脚のアヴァンドナー・ガブリエッラ（出所不明、くふふと笑う不気味な女）がテーブルに近付き、「線路途中の渓谷にイデアグロリアのエグゾーストフォートレスが潜んでいる」という不吉な噂を置いていく。
出力: 描写とガブリエッラの台詞を3〜4段落・計200〜280字で。彼女の正体・目的には踏み込まないこと。`,
  briefing: `場面: 脳内通信でC3から緊急依頼。フィクサーのアイカ・ゲフェスがモニタ越しに説明する: 再起動したザイラを線路到達前に破壊せよ。報酬800ルアド。
出力: 通信の到来描写とアイカの簡潔で慣れた依頼の台詞を3〜4段落・計200〜280字で。`,
  prebattle: `場面: 出撃準備。通常のヘリ空輸ではなく、アヴァンドナーの背部に接続するロケットブースタでの超高速突入が告げられる。姉貴分が隣に並ぶ。
出力: 出撃前の空気と姉貴分の気負わせない短い台詞を含めて、2〜3段落・計150〜220字で。`,
  "reply-prebattle": `場面: 出撃直前。ロケットブースタ装着を待つ新人に、隣に並んだ姉貴分へプレイヤーが言葉をかけた。
出力: 姉貴分の返答を台詞＋短い地の文で計80〜150字で。新人を励ます、頼れる先輩の口調。`,
  insertion: `場面: ロケットブースタで音速を超えてローザ渓谷へ突入。ブースタをパージし、目前に全高80メートルの直方体ザイラが見える。
出力: 突入の緊張とザイラの威容の描写を2〜3段落・計150〜230字で。`,
  ending: `場面: ザイラ撃破後。装甲列車が無事C3に到着し、ステラが兄と再会。夜、パブ「スターダスト」で新人の歓迎会。
出力: エピローグとして、プレイヤーの選択履歴（choicesに入っている）をさりげなく拾いつつ、締めの語りを3〜4段落・計200〜280字で。最後は「君と生きるために」に通じる余韻で。`,
};

interface NarrateRequest {
  scene?: unknown;
  freeInput?: unknown;
  choices?: unknown;
  battleResult?: unknown;
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405, headers });
  }
  if (process.env.TRIAL_ENABLED === "false") {
    return Response.json({ error: "closed" }, { status: 403, headers });
  }

  // プロキシは右に追記するので、実クライアント IP は末尾に来る
  // （先頭は呼び出し側が自由に偽装できる）
  const ip =
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown";
  if (!allowRequest(ip)) {
    return Response.json({ error: "rate limited" }, { status: 429, headers });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "not configured" }, { status: 503, headers });
  }

  let body: NarrateRequest;
  try {
    body = (await request.json()) as NarrateRequest;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400, headers });
  }

  const scene = typeof body.scene === "string" ? body.scene : "";
  const scenePrompt = SCENE_PROMPTS[scene];
  if (!scenePrompt) {
    return Response.json({ error: "unknown scene" }, { status: 400, headers });
  }

  const userParts: string[] = [];
  if (typeof body.freeInput === "string" && body.freeInput.trim().length > 0) {
    userParts.push(`プレイヤーの言葉: 「${body.freeInput.slice(0, MAX_FREE_INPUT)}」`);
  }
  if (Array.isArray(body.choices)) {
    const choices = body.choices
      .filter((c): c is string => typeof c === "string")
      .slice(0, 20);
    if (choices.length > 0) {
      userParts.push(`プレイヤーがこれまで選んだもの: ${choices.join(" / ")}`);
    }
  }
  if (body.battleResult === "lost-then-won") {
    userParts.push("戦闘では一度機関停止しかけたが、再挑戦して勝った");
  }
  const userMessage = userParts.length > 0 ? userParts.join("\n") : "この場面の語りを書いてください。";

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: COMMON_PROMPT },
          { role: "system", content: scenePrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
    if (!res.ok) {
      // キーや入力文を記録せず、管理画面で失敗の種類を確認できるようにする。
      const detail = await res.json().catch(() => null) as {
        error?: { code?: string; type?: string };
      } | null;
      console.error("OpenAI request failed", {
        status: res.status,
        code: detail?.error?.code,
        type: detail?.error?.type,
      });
      return Response.json({ error: "upstream" }, { status: 502, headers });
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return Response.json({ error: "empty" }, { status: 502, headers });
    }
    return Response.json({ text }, { headers });
  } catch (error) {
    console.error("OpenAI connection failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "upstream" }, { status: 502, headers });
  }
}

function corsHeaders(origin: string): HeadersInit {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}
