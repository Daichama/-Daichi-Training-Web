import { NextResponse } from "next/server";

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

export async function POST(request) {
  try {
    const { part, exercises } = await request.json();

    if (
      !VALID_PARTS.includes(part) ||
      !Array.isArray(exercises) ||
      exercises.length === 0
    ) {
      return NextResponse.json(
        { error: "入力が不正です" },
        { status: 400 }
      );
    }

    const today = todayInJapan();

    /*
      ここではNotionに何も作成しない。

      Workout開始時点では、
      ブラウザ内で使う仮Workoutと仮セットだけを返す。

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
