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
  updatePage,
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
    const {
      part,
      exercises,
      logs,
      durationMinutes,
      startedAt,
      workoutDate,
      startTime,
      endTime,
      sessionMemo,
      exerciseNotes,
      ratings,
    } = await request.json();

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

    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(workoutDate || ""))
      ? String(workoutDate)
      : todayInJapan();
    const safeStartTime = /^\d{2}:\d{2}$/.test(String(startTime || "")) ? String(startTime) : "";
    const safeEndTime = /^\d{2}:\d{2}$/.test(String(endTime || "")) ? String(endTime) : "";
    const timeMemo = safeStartTime && safeEndTime
      ? `開始 ${safeStartTime} / 終了 ${safeEndTime}`
      : "時刻未指定";

    const ratingMemo = [
      ratings?.assessment ? `評価：${ratings.assessment}` : "",
      ratings?.pump ? `パンプ：${ratings.pump}` : "",
    ].filter(Boolean).join(" / ");
    const workoutMemo = [timeMemo, ratingMemo, String(sessionMemo || "").trim()].filter(Boolean).join(" / ");

    const workoutPage = await createPage(DB.workout, {
      Workout: titleValue(`${date}｜${part}`),
      日付: dateValue(date),
      部位: multiValue([part]),
      完了: checkboxValue(true),
      所要時間min: numberProp(normalizeNumber(durationMinutes)),
      メモ: richValue(workoutMemo),
    });

    // v9.2.2: クライアントで確定した実施順を最優先する。
    // Notionの作成時刻や非同期保存順には依存しない。
    const exerciseIndex = new Map(exercises.map((exercise, index) => [exercise.id, index]));
    const explicitOrder = new Map();
    const firstCompletedAt = new Map();
    for (const log of completedLogs) {
      const order = Number(log.exerciseOrder);
      if (Number.isFinite(order) && order > 0) {
        const current = explicitOrder.get(log.exerciseId);
        if (!current || order < current) explicitOrder.set(log.exerciseId, order);
      }
      const stamp = Number(log.completedAt);
      if (Number.isFinite(stamp) && stamp > 0) {
        const current = firstCompletedAt.get(log.exerciseId);
        if (!current || stamp < current) firstCompletedAt.set(log.exerciseId, stamp);
      }
    }
    const performedExerciseIds = [...new Set(completedLogs.map((log) => log.exerciseId))]
      .sort((a, b) => {
        const aOrder = explicitOrder.get(a);
        const bOrder = explicitOrder.get(b);
        if (aOrder && bOrder && aOrder !== bOrder) return aOrder - bOrder;
        if (aOrder && !bOrder) return -1;
        if (!aOrder && bOrder) return 1;
        const aTime = firstCompletedAt.get(a);
        const bTime = firstCompletedAt.get(b);
        if (aTime && bTime && aTime !== bTime) return aTime - bTime;
        if (aTime && !bTime) return -1;
        if (!aTime && bTime) return 1;
        return (exerciseIndex.get(a) ?? 999) - (exerciseIndex.get(b) ?? 999);
      });
    const exerciseOrder = new Map(performedExerciseIds.map((id, index) => [id, index + 1]));
    const orderedCompletedLogs = [...completedLogs].sort((a, b) =>
      (exerciseOrder.get(a.exerciseId) || 999) - (exerciseOrder.get(b.exerciseId) || 999) ||
      Number(a.setNo) - Number(b.setNo)
    );

    const createdLogs = [];
    const failedLogs = [];

    // Ver.8: ユーザーが入力した種目メモを種目マスターへ戻し、次回表示に引き継ぐ。
    for (const exercise of exerciseMap.values()) {
      const note = String(exerciseNotes?.[exercise.id] || "").trim();
      try {
        await updatePage(exercise.id, { "フォーム・運用メモ": richValue(note) });
      } catch {
        // メモ列が未設定でもWorkout保存は止めない。
      }
    }

    for (const log of orderedCompletedLogs) {
      const exercise = exerciseMap.get(log.exerciseId);
      const weight = normalizeNumber(log.weight);
      const reps = normalizeNumber(log.reps);
      const rir = normalizeNumber(log.rir);
      const extraReps = Math.max(0, normalizeNumber(log.extraReps) || 0);
      const totalReps = reps + extraReps;
      const volume = weight * totalReps;
      const e1rm = weight * (1 + totalReps / 30);

      try {
        const created = await createPage(DB.log, {
          ログ: titleValue(`${exercise.name}｜Set ${log.setNo}`),
          日付: dateValue(date),
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
          メモ: richValue([
            `前回：${exercise.previous || "未記録"}`,
            extraReps > 0 ? `レストポーズ +${extraReps}回` : "",
            Number(log.actualRest) > 0 ? `休憩 予定${Number(log.plannedRest) || 80}秒 / 実際${Number(log.actualRest)}秒 / 差${Number(log.restDelta) >= 0 ? "+" : ""}${Number(log.restDelta) || 0}秒` : "",
            log.restReason ? `休憩理由：${log.restReason}` : "",
            log.readyScore ? `Ready：${log.readyScore}` : "",
            `[DLOG_EXERCISE_ORDER=${exerciseOrder.get(exercise.id) || 999}]`,
            String(exerciseNotes?.[exercise.id] || "").trim(),
          ].filter(Boolean).join(" / ")),
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
            date,
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
        date,
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
