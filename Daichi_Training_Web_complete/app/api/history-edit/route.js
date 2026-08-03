import { NextResponse } from "next/server";
import {
  DB,
  archivePage,
  checkboxValue,
  createPage,
  dateValue,
  numberProp,
  relationValue,
  richValue,
  selectValue,
  titleValue,
  updatePage,
} from "../../lib/notion";

export const runtime = "nodejs";

function n(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function orderMemo(memo, order) {
  const cleaned = String(memo || "")
    .replace(/\s*\/?\s*\[DLOG_EXERCISE_ORDER=\d+\]/g, "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .trim();
  return [cleaned, `[DLOG_EXERCISE_ORDER=${order}]`].filter(Boolean).join(" / ");
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { workoutId, date, part, exercises = [], deletedLogIds = [], workoutMemo } = body;
    if (!workoutId || !date || !part || !Array.isArray(exercises)) {
      return NextResponse.json({ error: "編集データが不正です" }, { status: 400 });
    }

    for (const id of deletedLogIds) {
      if (id && !String(id).startsWith("tmp-")) await archivePage(id);
    }

    let savedSets = 0;
    for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
      const exercise = exercises[exerciseIndex];
      if (!exercise?.exerciseId || !Array.isArray(exercise.sets)) continue;
      const order = exerciseIndex + 1;
      for (let setIndex = 0; setIndex < exercise.sets.length; setIndex += 1) {
        const set = exercise.sets[setIndex];
        const weight = n(set.weight, NaN);
        const reps = n(set.reps, NaN);
        if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(reps) || reps <= 0) continue;
        const rir = set.rir === "" || set.rir == null ? null : n(set.rir, null);
        const setNo = setIndex + 1;
        const volume = weight * reps;
        const e1rm = weight * (1 + reps / 30);
        const memo = orderMemo(set.memo, order);
        const properties = {
          ログ: titleValue(`${exercise.name}｜Set ${setNo}`),
          日付: dateValue(date),
          Workout: relationValue([workoutId]),
          種目: relationValue([exercise.exerciseId]),
          部位: selectValue(exercise.part || part),
          セット番号: numberProp(setNo),
          セット種別: selectValue(setNo === 1 ? "トップセット" : "通常"),
          重量kg: numberProp(weight),
          回数: numberProp(reps),
          RIR: numberProp(rir),
          ボリューム: numberProp(volume),
          推定1RM: numberProp(e1rm),
          完了: checkboxValue(true),
          メモ: richValue(memo),
        };
        if (set.id && !String(set.id).startsWith("tmp-")) await updatePage(set.id, properties);
        else await createPage(DB.log, properties);
        savedSets += 1;
      }
    }

    if (workoutMemo !== undefined) {
      await updatePage(workoutId, { メモ: richValue(String(workoutMemo || "")) });
    }

    return NextResponse.json({ ok: true, savedSets });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "履歴を更新できませんでした" }, { status: 500 });
  }
}
