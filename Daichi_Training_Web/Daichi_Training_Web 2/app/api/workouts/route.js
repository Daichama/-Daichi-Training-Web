import { NextResponse } from "next/server";
import {
  DB, checkboxValue, createPage, dateValue, multiValue, numberProp,
  relationValue, richValue, selectValue, titleValue
} from "../../lib/notion";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { part, exercises } = await request.json();
    if (!["胸", "背中", "肩", "腕", "脚"].includes(part) || !Array.isArray(exercises)) {
      return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
    }

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());

    const workout = await createPage(DB.workout, {
      "Workout": titleValue(`${today}｜${part}`),
      "日付": dateValue(today),
      "部位": multiValue([part]),
      "完了": checkboxValue(false),
      "メモ": richValue("スマホWebアプリで自動作成")
    });

    const logs = [];
    for (const exercise of exercises) {
      for (let setNo = 1; setNo <= exercise.sets; setNo++) {
        const previousSet = exercise.previousSets?.[setNo - 1] || null;
        const isTop = setNo === 1 && ["ベンチプレス", "荷重懸垂", "ミリタリープレス"].includes(exercise.name);
        const type = exercise.part === "ウォームアップ" ? "ウォームアップ" : isTop ? "トップセット" : "通常";
        const presetWeight = previousSet?.weight ?? "";
        const presetReps = previousSet?.reps ?? "";
        const volume = presetWeight !== "" && presetReps !== "" ? Number(presetWeight) * Number(presetReps) : null;
        const e1rm = presetWeight !== "" && presetReps !== "" ? Number(presetWeight) * (1 + Number(presetReps) / 30) : null;

        const log = await createPage(DB.log, {
          "ログ": titleValue(`${exercise.name}｜Set ${setNo}`),
          "日付": dateValue(today),
          "Workout": relationValue([workout.id]),
          "種目": relationValue([exercise.id]),
          "部位": selectValue(exercise.part),
          "セット番号": numberProp(setNo),
          "セット種別": selectValue(type),
          "重量kg": numberProp(presetWeight === "" ? null : presetWeight),
          "回数": numberProp(presetReps === "" ? null : presetReps),
          "ボリューム": numberProp(volume),
          "推定1RM": numberProp(e1rm),
          "完了": checkboxValue(false),
          "メモ": richValue(`前回：${exercise.previous || "未記録"}`)
        });
        logs.push({
          id: log.id,
          url: log.url,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          setNo,
          previousSet,
          weight: String(presetWeight),
          reps: String(presetReps),
          rir: "",
          completed: false
        });
      }
    }

    return NextResponse.json({
      workout: { id: workout.id, url: workout.url, date: today, part },
      logs
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
