import { NextResponse } from "next/server";
import {
  DB,
  archivePage,
  createPage,
  dateValue,
  numberProp,
  plain,
  queryAll,
  relationIds,
  relationValue,
  richValue,
  selectName,
  selectValue,
  titleValue,
  updatePage,
} from "../../../lib/notion";

export const runtime = "nodejs";

function exerciseName(page) {
  return plain(page.properties?.["種目"]) || plain(page.properties?.["種目名"]) || plain(page.properties?.["名前"]);
}

export async function POST() {
  try {
    const [masters, logs] = await Promise.all([queryAll(DB.master), queryAll(DB.log)]);
    const decline = masters.find((page) => exerciseName(page).trim() === "デクライン" && selectName(page.properties?.["部位"]) === "胸");
    let smith = masters.find((page) => exerciseName(page).trim() === "スミスインクラインプレス");

    if (!smith) {
      smith = await createPage(DB.master, {
        "種目": titleValue("スミスインクラインプレス"),
        "部位": selectValue("胸"),
        "順番": numberProp(decline?.properties?.["順番"]?.number || 3),
        "標準セット": richValue(plain(decline?.properties?.["標準セット"]) || "4セット"),
        "目標レップ": richValue(plain(decline?.properties?.["目標レップ"]) || "6-10回"),
        "開始重量": richValue(plain(decline?.properties?.["開始重量"]) || ""),
        "フォーム・運用メモ": richValue(plain(decline?.properties?.["フォーム・運用メモ"]) || ""),
      });
    }

    let updatedLogs = 0;
    if (decline) {
      for (const page of logs) {
        const date = page.properties?.["日付"]?.date?.start || "";
        const exerciseId = relationIds(page.properties?.["種目"])[0] || relationIds(page.properties?.["種目リンク"])[0] || "";
        if (date !== "2026-08-01" || exerciseId !== decline.id) continue;
        const setNo = page.properties?.["セット番号"]?.number || page.properties?.["セット"]?.number || 1;
        await updatePage(page.id, {
          "ログ": titleValue(`スミスインクラインプレス｜Set ${setNo}`),
          "種目": relationValue([smith.id]),
          "部位": selectValue("胸"),
        });
        updatedLogs += 1;
      }
      await archivePage(decline.id);
    }

    return NextResponse.json({
      ok: true,
      updatedLogs,
      smithExerciseId: smith.id,
      declineArchived: Boolean(decline),
      message: `8/1の${updatedLogs}セットをスミスインクラインプレスへ変更し、胸テンプレからデクラインを外したで。`,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "修正に失敗しました" }, { status: 500 });
  }
}
