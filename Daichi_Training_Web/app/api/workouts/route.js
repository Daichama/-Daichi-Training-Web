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
  titleValue
} from "../../lib/notion";

export const runtime = "nodejs";

const VALID_PARTS = ["胸", "背中", "肩", "腕", "脚"];

function todayInJapan() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export async function POST(request) {
  try {
    const { part, exercises, logs } = await request.json();

    if (!VALID_PARTS.includes(part)) {
      return NextResponse.json(
        { error: "部位が不正です" },
        { status: 400 }
      );
    }

    if (!Array.isArray(exercises) || !Array.isArray(logs)) {
      return NextResponse.json(
        { error: "記録データが不正です" },
        { status: 400 }
      );
    }

    const completedLogs = logs.filter((log) => {
      const weight = Number(log.weight);
      const reps = Number(log.reps);

      return (
        log.completed &&
        Number.isFinite(weight) &&
        Number.isFinite(reps) &&
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

    // トレ終了時に初めてWorkoutを作成
    const workout = await createPage(DB.workout, {
      "Workout": titleValue(`${today}｜${part}`),
      "日付": dateValue(today),
      "部位": multiValue([part]),
      "完了": checkboxValue(true),
      "メモ": richValue("Daichi Training v2からトレ終了時に保存")
    });

    const createdLogs = [];

    for (const log of completedLogs) {
      const exercise = exercises.find(
        (item) => item.id === log.exerciseId
      );

      if (!exercise) continue;

      const weight = Number(log.weight);
      const reps = Number(log.reps);

      const rir =
        log.rir === "" ||
        log.rir === null ||
        log.rir === undefined
          ? null
          : Number(log.rir);

      const volume = weight * reps;
      const e1rm = reps > 0 ? weight * (1 + reps / 30) : 0;

      const isTopSet =
        Number(log.setNo) === 1 &&
        ["ベンチプレス", "荷重懸垂", "ミリタリープレス"].includes(
          exercise.name
        );

      const setType =
        exercise.part === "ウォームアップ"
          ? "ウォームアップ"
          : isTopSet
          ? "トップセット"
          : "通常";

      const created = await createPage(DB.log, {
        "ログ": titleValue(
          `${exercise.name}｜Set ${log.setNo}`
        ),
        "日付": dateValue(today),
        "Workout": relationValue([workout.id]),
        "種目": relationValue([exercise.id]),
        "部位": selectValue(exercise.part),
        "セット番号": numberProp(log.setNo),
        "セット種別": selectValue(setType),
        "重量kg": numberProp(weight),
        "回数": numberProp(reps),
        "RIR": numberProp(rir),
        "ボリューム": numberProp(volume),
        "推定1RM": numberProp(e1rm),
        "完了": checkboxValue(true),
        "メモ": richValue(
          `前回：${exercise.previous || "未記録"}`
        )
      });

      createdLogs.push({
        id: created.id,
        url: created.url,
        exerciseId: exercise.id,
        setNo: log.setNo
      });
    }

    return NextResponse.json({
      ok: true,
      workout: {
        id: workout.id,
        url: workout.url,
        date: today,
        part
      },
      savedSets: createdLogs.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Workoutの保存に失敗しました"
      },
      { status: 500 }
    );
  }
}      ブラウザ内で使う仮Workoutと仮セットだけを返す。

      最初のセットを完了した時に、
      /api/logs 側でNotionのWorkoutを作成する。
    */

    const logs = [];

    for (const exercise of exercises) {
      const setCount = Math.max(
        1,
        Math.min(10, Number(exercise.sets) || 3)
      );

      for (let setNo = 1; setNo <= setCount; setNo++) {
        logs.push({
          id: `draft-${exercise.id}-${setNo}`,
          pageId: null,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          exercisePart: exercise.part,
          setNo,
          weight: "",
          reps: "",
          rir: "",
          completed: false,
          saving: false,
        });
      }
    }

    return NextResponse.json({
      workout: {
        id: null,
        url: "",
        date: today,
        part,
        saved: false,
      },
      logs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Workoutの準備に失敗しました",
      },
      { status: 500 }
    );
  }
}
