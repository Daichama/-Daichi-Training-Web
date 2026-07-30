"use client";

import { useEffect, useMemo, useState } from "react";

const PARTS = ["胸", "背中", "肩", "腕", "脚"];
const DRAFT_KEY = "daichi-training-v3-draft";
const REST_SECONDS = 90;

function parsePrevious(previous) {
  if (!previous || previous === "-" || previous === "なし" || previous === "未記録") {
    return [];
  }

  return String(previous)
    .split(/[\/／,\n]/)
    .map((item) => item.trim())
    .map((item) => {
      const match = item.match(/([\d.]+)\s*(?:kg|KG|㎏)?\s*[×xX＊*]\s*(\d+)/);
      if (!match) return null;
      return { weight: match[1], reps: match[2] };
    })
    .filter(Boolean);
}

function getExercisePrevious(exercise) {
  return parsePrevious(exercise?.previous);
}

function hydrateLogs(exercises, rawLogs) {
  return rawLogs.map((log) => {
    const exercise = exercises.find((item) => item.id === log.exerciseId);
    const previousSets = getExercisePrevious(exercise);
    const previous = previousSets[(Number(log.setNo) || 1) - 1];

    const hasWeight =
      log.weight !== undefined && log.weight !== null && String(log.weight) !== "";
    const hasReps =
      log.reps !== undefined && log.reps !== null && String(log.reps) !== "";

    return {
      ...log,
      weight: hasWeight ? String(log.weight) : previous?.weight || "",
      reps: hasReps ? String(log.reps) : previous?.reps || "",
      rir:
        log.rir !== undefined && log.rir !== null && String(log.rir) !== ""
          ? String(log.rir)
          : "",
      previousWeight: previous?.weight || "",
      previousReps: previous?.reps || "",
      saving: false,
    };
  });
}

function todayInJapan() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function timeInJapan(timestamp = Date.now()) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function minutesBetween(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

function createDraftLogs(exercises) {
  return exercises.flatMap((exercise) =>
    Array.from({ length: Number(exercise.sets) || 0 }, (_, index) => ({
      id: `draft-${exercise.id}-${index + 1}`,
      exerciseId: exercise.id,
      setNo: index + 1,
      completed: false,
      weight: "",
      reps: "",
      rir: "",
    }))
  );
}

function formatElapsed(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function compareSet(log) {
  const weight = Number(log.weight);
  const reps = Number(log.reps);
  const previousWeight = Number(log.previousWeight);
  const previousReps = Number(log.previousReps);
  if (![weight, reps, previousWeight, previousReps].every(Number.isFinite)) return null;
  const currentScore = weight * reps;
  const previousScore = previousWeight * previousReps;
  if (weight > previousWeight || (weight === previousWeight && reps > previousReps)) {
    return { label: "前回超え", type: "up" };
  }
  if (weight === previousWeight && reps === previousReps) {
    return { label: "前回同等", type: "same" };
  }
  if (currentScore > previousScore) return { label: "総負荷UP", type: "up" };
  return { label: "前回未満", type: "down" };
}

function progressionTarget(previousSets) {
  if (!previousSets.length) return "まず基準記録を作ろう";
  const top = previousSets[0];
  const reps = Number(top.reps);
  if (!Number.isFinite(reps)) return "前回記録を超えよう";
  return `${top.weight}kg × ${reps + 1}回を狙う`;
}

function formatVolume(value) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 1,
  }).format(value);
}

export default function Home() {
  const [part, setPart] = useState("");
  const [exercises, setExercises] = useState([]);
  const [workout, setWorkout] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draftChecked, setDraftChecked] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [summary, setSummary] = useState(null);
  const [dashboard, setDashboard] = useState({ workouts: 0, minutes: 0, volume: 0 });
  const [saveConfirm, setSaveConfirm] = useState(null);

  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerExercise, setTimerExercise] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft?.workout && Array.isArray(draft.exercises) && Array.isArray(draft.logs)) {
          setPart(draft.part || draft.workout.part || "");
          setExercises(draft.exercises);
          setWorkout({ ...draft.workout, startedAt: draft.workout.startedAt || Date.now() });
          setLogs(hydrateLogs(draft.exercises, draft.logs));
          setMessage("途中のWorkoutを復元したで。");
        }
      }
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    } finally {
      setDraftChecked(true);
    }
  }, []);

  async function refreshDashboard() {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "集計を読み込めなかった。");
      }

      setDashboard({
        workouts: Number(data.workouts) || 0,
        minutes: Number(data.minutes) || 0,
        volume: Number(data.volume) || 0,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "集計の読み込みに失敗したで。");
    }
  }

  useEffect(() => {
    refreshDashboard();
  }, []);

  useEffect(() => {
    if (!workout || workout.saved) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [workout]);

  useEffect(() => {
    if (!draftChecked) return;

    if (!workout || workout.saved) {
      window.localStorage.removeItem(DRAFT_KEY);
      return;
    }

    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ part, exercises, workout, logs })
    );
  }, [draftChecked, part, exercises, workout, logs]);

  useEffect(() => {
    if (!timerRunning) return;

    if (timerSeconds <= 0) {
      setTimerRunning(false);

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      ) {
        navigator.vibrate([200, 100, 200]);
      }

      setMessage("休憩終了。次のセットいこ。");
      return;
    }

    const timerId = window.setTimeout(() => {
      setTimerSeconds((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [timerRunning, timerSeconds]);

  const grouped = useMemo(() => {
    return exercises.map((exercise) => ({
      exercise,
      logs: logs
        .filter((log) => log.exerciseId === exercise.id)
        .sort((a, b) => Number(a.setNo) - Number(b.setNo)),
    }));
  }, [exercises, logs]);

  const completedSets = useMemo(
    () => logs.filter((log) => log.completed).length,
    [logs]
  );

  const totalSets = logs.length;

  const totalVolume = useMemo(() => {
    return logs.reduce((total, log) => {
      if (!log.completed) return total;
      return total + (Number(log.weight) || 0) * (Number(log.reps) || 0);
    }, 0);
  }, [logs]);

  async function selectPart(value) {
    setBusy(true);
    setMessage("");
    setPart(value);
    setExercises([]);

    try {
      const response = await fetch(
        `/api/exercises?part=${encodeURIComponent(value)}`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "種目を読み込めなかった。");
      }

      setExercises(data.exercises || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "読み込みに失敗したで。");
    } finally {
      setBusy(false);
    }
  }

  function startWorkout() {
    if (!part || exercises.length === 0) {
      setMessage("部位と種目を選んで。");
      return;
    }

    const draftLogs = hydrateLogs(exercises, createDraftLogs(exercises));

    setWorkout({
      id: null,
      url: "",
      date: todayInJapan(),
      part,
      saved: false,
      startedAt: Date.now(),
    });
    setNow(Date.now());
    setLogs(draftLogs);
    setMessage("開始したで。Notionにはまだ何も作ってへん。");
  }

  function editLog(id, key, value) {
    setLogs((current) =>
      current.map((log) => (log.id === id ? { ...log, [key]: value } : log))
    );
  }

  function copyPrevious(log) {
    if (!log.previousWeight && !log.previousReps) {
      setMessage("コピーできる前回記録がないで。");
      return;
    }

    setLogs((current) =>
      current.map((item) =>
        item.id === log.id
          ? {
              ...item,
              weight: log.previousWeight || item.weight,
              reps: log.previousReps || item.reps,
            }
          : item
      )
    );
  }

  function selectRir(logId, value) {
    editLog(logId, "rir", String(value));
  }

  function startRestTimer(exercise) {
    setTimerSeconds(REST_SECONDS);
    setTimerExercise(exercise.name);
    setTimerRunning(true);
  }

  function saveLog(log, exercise) {
    if (workout?.saved) return;

    const nextComplete = !log.completed;

    if (nextComplete) {
      const weight = Number(log.weight);
      const reps = Number(log.reps);

      if (
        log.weight === "" ||
        log.reps === "" ||
        !Number.isFinite(weight) ||
        weight < 0 ||
        !Number.isFinite(reps) ||
        reps <= 0
      ) {
        setMessage("重量と回数を入れてから完了にして。");
        return;
      }
    }

    setLogs((current) =>
      current.map((item) =>
        item.id === log.id ? { ...item, completed: nextComplete } : item
      )
    );

    if (nextComplete) startRestTimer(exercise);
  }

  function openSaveConfirmation() {
    if (completedSets === 0) {
      setMessage("完了したセットがないで。");
      return;
    }

    if (workout?.saved) {
      setMessage("このWorkoutはもう保存済みやで。");
      return;
    }

    setSaveConfirm({
      date: workout?.date || todayInJapan(),
      startTime: timeInJapan(workout?.startedAt || Date.now()),
      endTime: timeInJapan(Date.now()),
    });
  }

  async function finishWorkout() {
    if (!saveConfirm) return;

    const durationMinutes = minutesBetween(saveConfirm.startTime, saveConfirm.endTime);
    if (durationMinutes <= 0) {
      setMessage("開始時刻と終了時刻を確認して。");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part,
          exercises,
          logs,
          workoutDate: saveConfirm.date,
          startTime: saveConfirm.startTime,
          endTime: saveConfirm.endTime,
          durationMinutes,
          startedAt: workout?.startedAt || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Workoutを保存できなかった。");
      }

      const durationSeconds = durationMinutes * 60;
      const finishedSummary = {
        part,
        durationSeconds,
        exercises: grouped.filter(({ logs: itemLogs }) => itemLogs.some((log) => log.completed)).length,
        sets: completedSets,
        reps: logs.reduce((total, log) => total + (log.completed ? Number(log.reps) || 0 : 0), 0),
        volume: totalVolume,
        prs: data.created || 0,
        savedSets: data.savedSets || 0,
      };
      setSaveConfirm(null);
      setSummary(finishedSummary);
      setWorkout({ ...data.workout, saved: true, startedAt: workout?.startedAt });
      await refreshDashboard();
      window.localStorage.removeItem(DRAFT_KEY);
      setTimerRunning(false);
      setTimerSeconds(0);

      const pieces = [`保存完了：${data.savedSets || 0}セット`];
      if (data.failedSets > 0) pieces.push(`保存失敗 ${data.failedSets}セット`);
      if (data.syncError) {
        pieces.push(`Summary/PR同期のみ失敗：${data.syncError}`);
      } else {
        pieces.push(`前回記録 ${data.updated || 0}種目`);
        pieces.push(`PR ${data.created || 0}件`);
      }
      setMessage(pieces.join(" / "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗したで。");
    } finally {
      setBusy(false);
    }
  }

  function discardWorkout() {
    if (!window.confirm("このWorkoutの入力内容を破棄する？")) return;
    window.localStorage.removeItem(DRAFT_KEY);
    setWorkout(null);
    setLogs([]);
    setExercises([]);
    setPart("");
    setTimerRunning(false);
    setTimerSeconds(0);
    setMessage("Workoutを破棄したで。");
  }

  function newWorkout() {
    window.localStorage.removeItem(DRAFT_KEY);
    setWorkout(null);
    setLogs([]);
    setExercises([]);
    setPart("");
    setTimerRunning(false);
    setTimerSeconds(0);
    setMessage("");
  }

  const elapsedSeconds = workout?.startedAt
    ? Math.max(0, Math.floor((now - Number(workout.startedAt)) / 1000))
    : 0;

  const monthWorkouts = dashboard.workouts;
  const monthMinutes = dashboard.minutes;
  const monthVolume = dashboard.volume;

  function exerciseVolume(exerciseLogs) {
    return exerciseLogs.reduce((total, log) => {
      if (!log.completed) return total;
      return total + (Number(log.weight) || 0) * (Number(log.reps) || 0);
    }, 0);
  }

  function formatTimer(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  if (!draftChecked) {
    return (
      <main>
        <div className="loader">読み込み中…</div>
      </main>
    );
  }

  return (
    <main>
      <header>
        <div className="eyebrow">DAICHI TRAINING v4.0.3</div>
        <h1>{workout ? `${workout.part} Day` : "今日はどこやる？"}</h1>
        {workout && <div className="date">{workout.date}</div>}
      </header>

      {!workout && (
        <>
          <section className="dashboard card">
            <div><small>今月のトレ</small><strong>{monthWorkouts}回</strong></div>
            <div><small>今月の時間</small><strong>{monthMinutes}分</strong></div>
            <div><small>今月のボリューム</small><strong>{formatVolume(monthVolume)}kg</strong></div>
          </section>
          <section className="parts">
            {PARTS.map((value) => (
              <button
                key={value}
                className={part === value ? "part active" : "part"}
                onClick={() => selectPart(value)}
                disabled={busy}
              >
                {value}
              </button>
            ))}
          </section>

          {exercises.length > 0 && (
            <section className="preview card">
              {exercises.map((exercise) => {
                const previousSets = getExercisePrevious(exercise);
                return (
                  <div className="previewRow" key={exercise.id}>
                    <div>
                      <strong>{exercise.name}</strong>
                      <small>
                        前回：
                        {previousSets.length > 0
                          ? previousSets
                              .map((set) => `${set.weight}kg×${set.reps}`)
                              .join(" / ")
                          : exercise.previous || "記録なし"}
                      </small>
                    </div>
                    <span>{exercise.sets} sets</span>
                  </div>
                );
              })}

              <button className="primary" onClick={startWorkout} disabled={busy}>
                {`${part} Dayを開始`}
              </button>
            </section>
          )}
        </>
      )}

      {workout && (
        <>
          <section className="summaryBar">
            <div>
              <small>経過時間</small>
              <strong>{formatElapsed(elapsedSeconds)}</strong>
            </div>
            <div>
              <small>完了セット</small>
              <strong>
                {completedSets}/{totalSets}
              </strong>
            </div>
            <div>
              <small>総ボリューム</small>
              <strong>{formatVolume(totalVolume)} kg</strong>
            </div>
          </section>

          <section className="workout">
            {grouped.map(({ exercise, logs: exerciseLogs }) => {
              const previousSets = getExercisePrevious(exercise);
              const volume = exerciseVolume(exerciseLogs);

              return (
                <article className="card exercise" key={exercise.id}>
                  <div className="exerciseHead">
                    <div>
                      <h2>{exercise.name}</h2>
                      <p>
                        {previousSets.length > 0
                          ? `前回：${previousSets
                              .map((set) => `${set.weight}kg×${set.reps}`)
                              .join(" / ")}`
                          : `前回：${exercise.previous || "記録なし"}`}
                      </p>
                    </div>
                    <span>{formatVolume(volume)} kg</span>
                  </div>

                  <div className="hint">
                      <span className="target">目標 {progressionTarget(previousSets)}</span>
                      {exercise.startWeight && <span>目安 {exercise.startWeight}</span>}
                      <span>休憩 {REST_SECONDS}秒</span>
                      {exercise.memo && <small>{exercise.memo}</small>}
                    </div>

                  <div className="setHeader">
                    <span>SET</span>
                    <span>KG</span>
                    <span>REPS</span>
                    <span>RIR</span>
                    <span></span>
                  </div>

                  {exerciseLogs.map((log) => (
                    <div
                      className={log.completed ? "setBlock done" : "setBlock"}
                      key={log.id}
                    >
                      <div className="setRow">
                        <b>{log.setNo}</b>
                        <input
                          inputMode="decimal"
                          placeholder="kg"
                          value={log.weight}
                          disabled={log.completed || workout.saved}
                          onChange={(event) =>
                            editLog(log.id, "weight", event.target.value)
                          }
                        />
                        <input
                          inputMode="numeric"
                          placeholder="回"
                          value={log.reps}
                          disabled={log.completed || workout.saved}
                          onChange={(event) =>
                            editLog(log.id, "reps", event.target.value)
                          }
                        />
                        <div className="rirValue">{log.rir === "" ? "−" : log.rir}</div>
                        <button
                          className="check"
                          disabled={workout.saved}
                          onClick={() => saveLog(log, exercise)}
                        >
                          {log.completed ? "✓" : "○"}
                        </button>
                      </div>

                      {log.completed && compareSet(log) && (
                        <div className={`comparison ${compareSet(log).type}`}>
                          {compareSet(log).label}
                        </div>
                      )}

                      {!log.completed && !workout.saved && (
                        <div className="setTools">
                          <button
                            className="previousButton"
                            onClick={() => copyPrevious(log)}
                            disabled={!log.previousWeight && !log.previousReps}
                          >
                            前回 {log.previousWeight ? `${log.previousWeight}kg` : "−"}×
                            {log.previousReps || "−"}
                          </button>
                          <div className="rirButtons">
                            {[0, 1, 2, 3, 4].map((value) => (
                              <button
                                key={value}
                                className={
                                  String(value) === String(log.rir)
                                    ? "rirButton active"
                                    : "rirButton"
                                }
                                onClick={() => selectRir(log.id, value)}
                              >
                                {value}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </article>
              );
            })}

            <button
              className="primary finish"
              onClick={openSaveConfirmation}
              disabled={busy || workout.saved}
            >
              {busy
                ? "保存・同期中…"
                : workout.saved
                ? "保存済み"
                : "トレ終了・記録を同期"}
            </button>

            {!workout.saved && (
              <button className="secondary danger" onClick={discardWorkout} disabled={busy}>
                このWorkoutを破棄
              </button>
            )}

            {workout.url && (
              <a className="notionLink" href={workout.url} target="_blank" rel="noreferrer">
                NotionでWorkoutを開く
              </a>
            )}

            {workout.saved && (
              <button className="secondary" onClick={newWorkout}>
                新しいWorkoutを始める
              </button>
            )}
          </section>
        </>
      )}

      {timerRunning && (
        <section className="restTimer">
          <div>
            <small>REST{timerExercise ? `・${timerExercise}` : ""}</small>
            <strong>{formatTimer(timerSeconds)}</strong>
          </div>
          <button
            onClick={() => {
              setTimerRunning(false);
              setTimerSeconds(0);
            }}
          >
            終了
          </button>
        </section>
      )}

      {saveConfirm && (
        <div className="modalBackdrop">
          <section className="summaryModal card saveConfirmModal">
            <small>SAVE WORKOUT</small>
            <h2>保存内容の確認</h2>

            <div className="saveFields">
              <label>
                <span>日付</span>
                <input
                  type="date"
                  value={saveConfirm.date}
                  onChange={(event) =>
                    setSaveConfirm((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </label>
              <div className="timeFields">
                <label>
                  <span>開始</span>
                  <input
                    type="time"
                    value={saveConfirm.startTime}
                    onChange={(event) =>
                      setSaveConfirm((current) => ({ ...current, startTime: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>終了</span>
                  <input
                    type="time"
                    value={saveConfirm.endTime}
                    onChange={(event) =>
                      setSaveConfirm((current) => ({ ...current, endTime: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="calculatedDuration">
                <span>所要時間</span>
                <strong>{minutesBetween(saveConfirm.startTime, saveConfirm.endTime)}分</strong>
              </div>
            </div>

            <button className="primary" onClick={finishWorkout} disabled={busy}>
              {busy ? "保存・同期中…" : "この内容で保存"}
            </button>
            <button className="secondary" onClick={() => setSaveConfirm(null)} disabled={busy}>
              キャンセル
            </button>
          </section>
        </div>
      )}

      {summary && (
        <div className="modalBackdrop">
          <section className="summaryModal card">
            <small>WORKOUT COMPLETE</small>
            <h2>{summary.part} Day 完了</h2>
            <div className="summaryGrid">
              <div><span>所要時間</span><strong>{formatElapsed(summary.durationSeconds)}</strong></div>
              <div><span>種目</span><strong>{summary.exercises}</strong></div>
              <div><span>総セット</span><strong>{summary.sets}</strong></div>
              <div><span>総レップ</span><strong>{summary.reps}</strong></div>
              <div className="wide"><span>総ボリューム</span><strong>{formatVolume(summary.volume)} kg</strong></div>
              <div className="wide"><span>PR更新</span><strong>{summary.prs}件</strong></div>
            </div>
            <button className="primary" onClick={() => setSummary(null)}>記録を見る</button>
            <button className="secondary" onClick={() => { setSummary(null); newWorkout(); }}>ホームへ戻る</button>
          </section>
        </div>
      )}

      {busy && exercises.length === 0 && <div className="loader">読み込み中…</div>}

      {message && (
        <div className="toast" onClick={() => setMessage("")}>
          {message}
        </div>
      )}
    </main>
  );
}
