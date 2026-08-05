import { NextResponse } from "next/server";
import { DB, numberValue, plain, queryAll, relationIds, selectName } from "../../lib/notion";

export const runtime = "nodejs";

function dateOf(page) { return page.properties?.日付?.date?.start || ""; }
function boolOf(prop) { return Boolean(prop?.checkbox); }
function multiNames(prop) { return (prop?.multi_select || []).map((item) => item.name); }
function safeText(prop) { return plain(prop) || ""; }
function sortDateDesc(a, b) { return String(b.date).localeCompare(String(a.date)); }
function exerciseOrderFromMemo(value) {
  const match = String(value || "").match(/\[DLOG_EXERCISE_ORDER=(\d+)\]/);
  return match ? Number(match[1]) : 0;
}

export async function GET() {
  try {
    const [masterPages, workoutPages, logPages] = await Promise.all([
      queryAll(DB.master),
      queryAll(DB.workout, { sorts: [{ property: "日付", direction: "descending" }] }),
      queryAll(DB.log, { sorts: [{ property: "日付", direction: "descending" }] }),
    ]);

    const exerciseMap = new Map(masterPages.map((page) => [page.id, {
      id: page.id,
      name: safeText(page.properties?.種目名) || safeText(page.properties?.名前) || safeText(page.properties?.種目) || "名称未設定",
      part: selectName(page.properties?.部位),
    }]));

    const workoutMap = new Map(workoutPages.map((page) => [page.id, {
      id: page.id,
      date: dateOf(page),
      part: multiNames(page.properties?.部位)[0] || "",
      duration: numberValue(page.properties?.所要時間min),
      memo: safeText(page.properties?.メモ),
    }]));

    let needsSmithInclineCorrection = false;
    const logs = logPages.filter((page) => boolOf(page.properties?.完了)).map((page) => {
      const exerciseId = relationIds(page.properties?.種目)[0] || "";
      const workoutId = relationIds(page.properties?.Workout)[0] || "";
      const exercise = exerciseMap.get(exerciseId) || { id: exerciseId, name: "不明な種目", part: selectName(page.properties?.部位) };
      const rawName = exercise.name;
      const shouldCorrectName = dateOf(page) === "2026-08-01" && rawName.trim() === "デクライン";
      if (shouldCorrectName) needsSmithInclineCorrection = true;
      return {
        id: page.id,
        date: dateOf(page),
        workoutId,
        exerciseId,
        exerciseName: shouldCorrectName ? "スミスインクラインプレス" : exercise.name,
        part: selectName(page.properties?.部位) || exercise.part || workoutMap.get(workoutId)?.part || "",
        setNo: numberValue(page.properties?.セット番号),
        weight: numberValue(page.properties?.重量kg),
        reps: numberValue(page.properties?.回数),
        rir: numberValue(page.properties?.RIR),
        volume: numberValue(page.properties?.ボリューム),
        e1rm: numberValue(page.properties?.推定1RM),
        memo: safeText(page.properties?.メモ),
        exerciseOrder: exerciseOrderFromMemo(safeText(page.properties?.メモ)),
        createdTime: page.created_time || "",
      };
    });

    const groupedWorkouts = new Map();
    for (const log of logs) {
      const key = log.workoutId || `${log.date}-${log.part}`;
      if (!groupedWorkouts.has(key)) {
        const source = workoutMap.get(log.workoutId) || {};
        groupedWorkouts.set(key, { id: key, date: log.date || source.date, part: log.part || source.part, duration: source.duration || 0, memo: source.memo || "", logs: [] });
      }
      groupedWorkouts.get(key).logs.push(log);
    }

    const history = Array.from(groupedWorkouts.values()).map((workout) => {
      const exercises = new Map();
      for (const log of workout.logs) {
        if (!exercises.has(log.exerciseId)) exercises.set(log.exerciseId, {
          id: log.exerciseId,
          name: log.exerciseName,
          sets: [],
          order: log.exerciseOrder || 0,
          firstCreatedTime: log.createdTime || "",
        });
        const grouped = exercises.get(log.exerciseId);
        grouped.sets.push(log);
        if (log.exerciseOrder && (!grouped.order || log.exerciseOrder < grouped.order)) grouped.order = log.exerciseOrder;
        if (log.createdTime && (!grouped.firstCreatedTime || log.createdTime < grouped.firstCreatedTime)) grouped.firstCreatedTime = log.createdTime;
      }
      return {
        id: workout.id,
        date: workout.date,
        part: workout.part,
        duration: workout.duration,
        memo: workout.memo,
        sets: workout.logs.length,
        reps: workout.logs.reduce((sum, item) => sum + item.reps, 0),
        volume: workout.logs.reduce((sum, item) => sum + item.volume, 0),
        bestE1rm: Math.max(0, ...workout.logs.map((item) => item.e1rm || 0)),
        exercises: Array.from(exercises.values())
          .sort((a, b) => {
            if (a.order && b.order && a.order !== b.order) return a.order - b.order;
            if (a.order && !b.order) return -1;
            if (!a.order && b.order) return 1;
            return String(a.firstCreatedTime).localeCompare(String(b.firstCreatedTime));
          })
          .map(({ order, firstCreatedTime, ...item }) => ({ ...item, sets: item.sets.sort((a, b) => a.setNo - b.setNo) })),
      };
    }).sort(sortDateDesc);

    const exerciseGroups = new Map();
    for (const log of logs) {
      if (!exerciseGroups.has(log.exerciseId)) exerciseGroups.set(log.exerciseId, { id: log.exerciseId, name: log.exerciseName, part: log.part, logs: [] });
      exerciseGroups.get(log.exerciseId).logs.push(log);
    }

    const exercises = Array.from(exerciseGroups.values()).map((exercise) => {
      const byDate = new Map();
      for (const log of exercise.logs) {
        if (!byDate.has(log.date)) byDate.set(log.date, []);
        byDate.get(log.date).push(log);
      }
      const sessions = Array.from(byDate.entries()).map(([date, sessionLogs]) => {
        const top = [...sessionLogs].sort((a, b) => (b.e1rm - a.e1rm) || (b.weight - a.weight))[0];
        return { date, topWeight: Math.max(...sessionLogs.map((item) => item.weight)), topSet: top ? `${top.weight}kg × ${top.reps}` : "-", e1rm: Math.max(...sessionLogs.map((item) => item.e1rm)), volume: sessionLogs.reduce((sum, item) => sum + item.volume, 0), sets: sessionLogs.length };
      }).sort((a, b) => a.date.localeCompare(b.date));
      const latest = sessions.at(-1) || null;
      return {
        id: exercise.id, name: exercise.name, part: exercise.part,
        sessions,
        latest,
        maxWeight: Math.max(0, ...exercise.logs.map((item) => item.weight)),
        bestE1rm: Math.max(0, ...exercise.logs.map((item) => item.e1rm)),
        totalSessions: sessions.length,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "ja"));

    const recent = history.slice(0, 12);
    const overview = {
      workouts: history.length,
      sets: logs.length,
      volume: logs.reduce((sum, item) => sum + item.volume, 0),
      recentWorkouts: recent.length,
    };

    return NextResponse.json({ ok: true, overview, history, exercises, needsSmithInclineCorrection });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "分析データを取得できませんでした" }, { status: 500 });
  }
}
