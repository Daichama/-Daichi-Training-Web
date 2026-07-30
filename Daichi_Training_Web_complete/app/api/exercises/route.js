import { NextResponse } from "next/server";
import {
  DB,
  numberValue,
  plain,
  queryAll,
  relationIds,
  selectName,
} from "../../lib/notion";

export const runtime = "nodejs";

const VALID_PARTS = ["胸", "背中", "肩", "腕", "脚"];

function parseSets(text) {
  const match = String(text || "").match(/\d+/);
  return Math.max(1, Math.min(10, match ? Number(match[0]) : 3));
}

export async function GET(request) {
  try {
    const part = new URL(request.url).searchParams.get("part");

    if (!VALID_PARTS.includes(part)) {
      return NextResponse.json({ error: "部位が不正です" }, { status: 400 });
    }

    const [masters, summaries] = await Promise.all([
      queryAll(DB.master),
      queryAll(DB.summary),
    ]);

    const previous = new Map();

    for (const page of summaries) {
      const id = relationIds(page.properties?.["種目リンク"])[0];
      if (id) {
        previous.set(id, plain(page.properties?.["前回記録"]) || "未記録");
      }
    }

    const exercises = masters
      .map((page) => ({
        id: page.id,
        name: plain(page.properties?.["種目"]),
        part: selectName(page.properties?.["部位"]),
        order: numberValue(page.properties?.["順番"]),
        setsText: plain(page.properties?.["標準セット"]),
        reps: plain(page.properties?.["目標レップ"]),
        startWeight: plain(page.properties?.["開始重量"]),
        rest: numberValue(page.properties?.["休憩秒"]),
        memo: plain(page.properties?.["フォーム・運用メモ"]),
        previous: previous.get(page.id) || "未記録",
      }))
      .filter(
        (exercise) =>
          exercise.part === part ||
          (part === "腕" && exercise.part === "ウォームアップ")
      )
      .sort((a, b) => {
        const aWarmup = a.part === "ウォームアップ" ? 0 : 1;
        const bWarmup = b.part === "ウォームアップ" ? 0 : 1;
        return aWarmup - bWarmup || a.order - b.order;
      })
      .map((exercise) => ({
        ...exercise,
        sets: parseSets(exercise.setsText),
      }));

    return NextResponse.json({ part, exercises });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "種目取得に失敗しました" },
      { status: 500 }
    );
  }
}
