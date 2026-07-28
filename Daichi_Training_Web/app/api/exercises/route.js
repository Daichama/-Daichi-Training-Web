import { NextResponse } from "next/server";
import { DB, plain, queryAll, relationIds, selectName, numberValue } from "../../lib/notion";

export const runtime = "nodejs";

function parseSets(text) {
  const match = String(text || "").match(/\d+/);
  return Math.max(1, Math.min(10, match ? Number(match[0]) : 3));
}

export async function GET(request) {
  try {
    const part = new URL(request.url).searchParams.get("part");
    if (!["胸", "背中", "肩", "腕", "脚"].includes(part)) {
      return NextResponse.json({ error: "部位が不正です" }, { status: 400 });
    }

    const [masters, summaries] = await Promise.all([
      queryAll(DB.master),
      queryAll(DB.summary)
    ]);

    const previous = new Map();
    for (const page of summaries) {
      const id = relationIds(page.properties?.["種目リンク"])[0];
      if (id) previous.set(id, plain(page.properties?.["前回記録"]) || "未記録");
    }

    const exercises = masters
      .map(page => ({
        id: page.id,
        name: plain(page.properties?.["種目"]),
        part: selectName(page.properties?.["部位"]),
        order: numberValue(page.properties?.["順番"]),
        setsText: plain(page.properties?.["標準セット"]),
        reps: plain(page.properties?.["目標レップ"]),
        startWeight: plain(page.properties?.["開始重量"]),
        rest: numberValue(page.properties?.["休憩秒"]),
        memo: plain(page.properties?.["フォーム・運用メモ"]),
        previous: previous.get(page.id) || "未記録"
      }))
      .filter(x => x.part === part || (part === "腕" && x.part === "ウォームアップ"))
      .sort((a, b) => {
        const aw = a.part === "ウォームアップ" ? 0 : 1;
        const bw = b.part === "ウォームアップ" ? 0 : 1;
        return aw - bw || a.order - b.order;
      })
      .map(x => ({ ...x, sets: parseSets(x.setsText) }));

    return NextResponse.json({ part, exercises });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
