import { NextResponse } from "next/server";
import {
  DB,
  numberValue,
  plain,
  queryAll,
  relationIds,
  selectName,
  createPage,
  titleValue,
  richValue,
  selectValue,
  numberProp,
} from "../../lib/notion";

export const runtime = "nodejs";

const VALID_PARTS = ["胸", "背中", "肩", "腕", "脚"];

function parseSets(text) {
  const match = String(text || "").match(/\d+/);
  return Math.max(1, Math.min(10, match ? Number(match[0]) : 3));
}

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const part = params.get("part");
    const all = params.get("all") === "1";

    if (!all && !VALID_PARTS.includes(part)) {
      return NextResponse.json({ error: "部位が不正です" }, { status: 400 });
    }

    const [masters, logs] = await Promise.all([
      queryAll(DB.master),
      queryAll(DB.log),
    ]);

    // v5.0: 前回値はSummary/MasterではなくExercise Logの最新完了記録から生成。
    const latestSets = new Map();
    const sortedLogs = [...logs].sort((a, b) =>
      new Date(b.last_edited_time || b.created_time) - new Date(a.last_edited_time || a.created_time)
    );
    for (const page of sortedLogs) {
      const props = page.properties || {};
      const exerciseId = relationIds(props["種目リンク"] || props["種目"])[0];
      const completed = props["完了"]?.checkbox ?? props["completed"]?.checkbox ?? true;
      if (!exerciseId || !completed) continue;
      const weight = numberValue(props["重量kg"] || props["重量"]);
      const reps = numberValue(props["回数"]);
      const setNo = numberValue(props["セット"] || props["セット番号"]) || 1;
      if (!(weight >= 0) || !(reps > 0)) continue;
      if (!latestSets.has(exerciseId)) latestSets.set(exerciseId, new Map());
      const setMap = latestSets.get(exerciseId);
      if (!setMap.has(setNo)) setMap.set(setNo, `${weight}kg×${reps}`);
    }
    const previous = new Map(
      [...latestSets.entries()].map(([id, setMap]) => [
        id,
        [...setMap.entries()].sort((a,b) => a[0]-b[0]).map(([,text]) => text).join(" / ") || "未記録",
      ])
    );

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
      .filter((exercise) => {
        const isDeprecatedDecline = exercise.part === "胸" && exercise.name.trim() === "デクライン";
        if (isDeprecatedDecline) return false;
        return all || exercise.part === part || (part === "腕" && exercise.part === "ウォームアップ");
      })
      .sort((a, b) => {
        const aWarmup = a.part === "ウォームアップ" ? 0 : 1;
        const bWarmup = b.part === "ウォームアップ" ? 0 : 1;
        return aWarmup - bWarmup || a.order - b.order;
      })
      .map((exercise) => ({
        ...exercise,
        sets: parseSets(exercise.setsText),
      }));

    return NextResponse.json({ part: all ? "all" : part, exercises });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "種目取得に失敗しました" },
      { status: 500 }
    );
  }
}


export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const part = String(body?.part || "").trim();
    const sets = Math.max(1, Math.min(10, Number(body?.sets) || 3));

    if (!name) {
      return NextResponse.json({ error: "種目名を入力してください" }, { status: 400 });
    }
    if (!VALID_PARTS.includes(part)) {
      return NextResponse.json({ error: "部位が不正です" }, { status: 400 });
    }

    const masters = await queryAll(DB.master);
    const duplicate = masters.find((page) =>
      plain(page.properties?.["種目"]).trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      return NextResponse.json({
        exercise: {
          id: duplicate.id,
          name: plain(duplicate.properties?.["種目"]),
          part: selectName(duplicate.properties?.["部位"]),
          order: numberValue(duplicate.properties?.["順番"]),
          sets,
          reps: plain(duplicate.properties?.["目標レップ"]),
          startWeight: plain(duplicate.properties?.["開始重量"]),
          memo: plain(duplicate.properties?.["フォーム・運用メモ"]),
          previous: "未記録",
        },
        existed: true,
      });
    }

    const maxOrder = masters
      .filter((page) => selectName(page.properties?.["部位"]) === part)
      .reduce((max, page) => Math.max(max, numberValue(page.properties?.["順番"])), 0);

    const page = await createPage(DB.master, {
      "種目": titleValue(name),
      "部位": selectValue(part),
      "順番": numberProp(maxOrder + 1),
      "標準セット": richValue(`${sets}セット`),
    });

    return NextResponse.json({
      exercise: {
        id: page.id,
        name,
        part,
        order: maxOrder + 1,
        sets,
        reps: "",
        startWeight: "",
        memo: "",
        previous: "未記録",
      },
      existed: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "種目作成に失敗しました" },
      { status: 500 }
    );
  }
}
