import { NextResponse } from "next/server";
import {
  DB,
  checkboxValue,
  createPage,
  dateValue,
  multiValue,
  numberProp,
  relationValue,
  richValue,
  selectValue,
  titleValue,
} from "../../lib/notion";
import { syncTrainingData } from "../../lib/sync";

export const runtime = "nodejs";

const VALID_PARTS = ["胸", "背中", "肩", "腕", "脚"];

function todayInJapan() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function setTypeFor(exercise, log) {
  if (exercise.part === "ウォームアップ") return "ウォームアップ";
  if (Number(log.setNo) === 1) return "トップセット";
  return "通常";
}

export async function POST(request) {
  try {
    const { part, exercises, logs } = await request.json();

    if (!VALID_PARTS.includes(part)) {
      return NextResponse.json({ error: "部位が不正です" }, { status: 400 });
    }

    if (!Array.isArray(exercises) || !Array.isArray(logs)) {
      return NextResponse.json(
        { error: "記録データが不正です" },
        { status: 400 }
      );
    }

    const exerciseMap = new Map(
      exercises
        .filter((exercise) => exercise?.id && exercise?.name)
        .map((exercise) => [exercise.id, exercise])
    );

    const completedLogs = logs.filter((log) => {
      const weight = normalizeNumber(log.weight);
      const reps = normalizeNumber(log.reps);

      return (
        Boolean(log.completed) &&
        exerciseMap.has(log.exerciseId) &&
        weight !== null &&
        weight >= 0 &&
        reps !== null &&
        reps > 0
      );
    });

    if (completedLogs.length === 0) {
      return NextResponse.json(
        { error: "完了したセットがありません" },
        { status: 400 }
      );
    }

    const today = todayInJapan();

    const workoutPage = await createPage(DB.workout, {
      Workout: titleValue(`${today}｜${part}`),
      日付: dateValue(today),
      部位: multiValue([part]),
      完了: checkboxValue(true),
      メモ: richValue("Daichi Training v3からトレ終了時に一括保存"),
    });

    const createdLogs = [];
    const failedLogs = [];

    for (const log of completedLogs) {
      const exercise = exerciseMap.get(log.exerciseId);
      const weight = normalizeNumber(log.weight);
      const reps = normalizeNumber(log.reps);
      const rir = normalizeNumber(log.rir);
      const volume = weight * reps;
      const e1rm = weight * (1 + reps / 30);

      try {
        const created = await createPage(DB.log, {
          ログ: titleValue(`${exercise.name}｜Set ${log.setNo}`),
          日付: dateValue(today),
          Workout: relationValue([workoutPage.id]),
          種目: relationValue([exercise.id]),
          部位: selectValue(exercise.part || part),
          セット番号: numberProp(log.setNo),
          セット種別: selectValue(setTypeFor(exercise, log)),
          重量kg: numberProp(weight),
          回数: numberProp(reps),
          RIR: numberProp(rir),
          ボリューム: numberProp(volume),
          推定1RM: numberProp(e1rm),
          完了: checkboxValue(true),
          メモ: richValue(`前回：${exercise.previous || "未記録"}`),
        });

        createdLogs.push({
          id: created.id,
          url: created.url,
          exerciseId: exercise.id,
          setNo: log.setNo,
        });
      } catch (error) {
        failedLogs.push({
          exercise: exercise.name,
          setNo: log.setNo,
          error: error instanceof Error ? error.message : "保存失敗",
        });
      }
    }

    if (createdLogs.length === 0) {
      return NextResponse.json(
        {
          error: "Workoutは作成されましたが、セットを保存できませんでした",
          workout: {
            id: workoutPage.id,
            url: workoutPage.url,
            date: today,
            part,
          },
          failedSets: failedLogs.length,
        },
        { status: 500 }
      );
    }

    let sync = { updated: 0, created: 0 };
    let syncError = "";

    try {
      sync = await syncTrainingData();
    } catch (error) {
      syncError = error instanceof Error ? error.message : "同期失敗";
    }

    return NextResponse.json({
      ok: true,
      workout: {
        id: workoutPage.id,
        url: workoutPage.url,
        date: today,
        part,
      },
      savedSets: createdLogs.length,
      failedSets: failedLogs.length,
      failures: failedLogs,
      updated: sync.updated,
      created: sync.created,
      syncError,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Workoutの保存に失敗しました",
      },
      { status: 500 }
    );
  }
}
