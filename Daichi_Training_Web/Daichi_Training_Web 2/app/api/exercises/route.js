import { NextResponse } from "next/server";
import { DB, plain, queryAll, relationIds, selectName, numberValue } from "../../lib/notion";

export const runtime = "nodejs";

function parseSets(text) {
  const match = String(text || "").match(/\d+/);
  return Math.max(1, Math.min(10, match ? Number(match[0]) : 3));
}

function parsePrevious(text) {
  if (!text || text === "未記録") return [];
  return String(text).split("/").map(item => {
    const match = item.trim().match(/([\d.]+)\s*kg\s*[×xX]\s*(\d+)/i);
    return match ? { weight: Number(match[1]), reps: Number(match[2]) } : null;
  }).filter(Boolean);
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

    const summaryMap = new Map();
    for (const page of summaries) {
      const id = relationIds(page.properties?.["種目リンク"])[0];
      if (!id) continue;
      const previous = plain(page.properties?.["前回記録"]) || "未記録";
      summaryMap.set(id, {
        previous,
        previousSets: parsePrevious(previous),
        bestWeight: numberValue(page.properties?.["最高重量kg"]),
        bestE1Rm: numberValue(page.properties?.["最高推定1RM"]),
        bestVolume: numberValue(page.properties?.["最高セットVolume"])
      });
    }

    const exercises = masters
      .map(page => {
        const summary = summaryMap.get(page.id) || {};
        return {
          id: page.id,
          name: plain(page.properties?.["種目"]),
          part: selectName(page.properties?.["部位"]),
          order: numberValue(page.properties?.["順番"]),
          setsText: plain(page.properties?.["標準セット"]),
          reps: plain(page.properties?.["目標レップ"]),
          startWeight: plain(page.properties?.["開始重量"]),
          rest: numberValue(page.properties?.["休憩秒"]),
          memo: plain(page.properties?.["フォーム・運用メモ"]),
          previous: summary.previous || "未記録",
          previousSets: summary.previousSets || [],
          bestWeight: summary.bestWeight || 0,
          bestE1RM: summary.bestE1Rm || 0,
          bestVolume: summary.bestVolume || 0
        };
      })
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
