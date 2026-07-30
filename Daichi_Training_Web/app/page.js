"use client";

import { useEffect, useMemo, useState } from "react";

const PARTS = ["胸", "背中", "肩", "腕", "脚"];

function parsePrevious(previous) {
  if (!previous || previous === "-" || previous === "なし") return [];

  return previous
    .split(/[\/／,\n]/)
    .map((item) => item.trim())
    .map((item) => {
      const match = item.match(
        /([\d.]+)\s*(?:kg|KG|㎏)?\s*[×xX＊*]\s*(\d+)/
      );

      if (!match) return null;

      return {
        weight: match[1],
        reps: match[2],
      };
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
      log.weight !== undefined &&
      log.weight !== null &&
      String(log.weight) !== "";

    const hasReps =
      log.reps !== undefined &&
      log.reps !== null &&
      String(log.reps) !== "";

    return {
      ...log,
      weight: hasWeight ? String(log.weight) : previous?.weight || "",
      reps: hasReps ? String(log.reps) : previous?.reps || "",
      rir:
        log.rir !== undefined &&
        log.rir !== null &&
        String(log.rir) !== ""
          ? String(log.rir)
          : "",
      previousWeight: previous?.weight || "",
      previousReps: previous?.reps || "",
      saving: false,
    };
  });
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

  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerExercise, setTimerExercise] = useState("");

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

  const totalVolume = useMemo(() => {
    return logs.reduce((total, log) => {
      if (!log.completed) return total;

      const weight = Number(log.weight) || 0;
      const reps = Number(log.reps) || 0;

      return total + weight * reps;
    }, 0);
  }, [logs]);

  const completedSets = useMemo(() => {
    return logs.filter((log) => log.completed).length;
  }, [logs]);

  const totalSets = logs.length;

  async function selectPart(value) {
    setBusy(true);
    setMessage("");
    setWorkout(null);
    setLogs([]);
    setPart(value);

    try {
      const res = await fetch(
        `/api/exercises?part=${encodeURIComponent(value)}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "種目を読み込めなかった。");
      }

      setExercises(data.exercises || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function startWorkout() {
    setBusy(true);
    setMessage("");

    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          part,
          exercises,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Workoutを作成できなかった。");
      }

      setWorkout(data.workout);
      setLogs(hydrateLogs(exercises, data.logs || []));
      setMessage("Workoutを作成したで。前回値を入れといた。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function editLog(id, key, value) {
    setLogs((current) =>
      current.map((log) =>
        log.id === id
          ? {
              ...log,
              [key]: value,
            }
          : log
      )
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
    const seconds = Number(exercise.rest) || 90;

    setTimerSeconds(seconds);
    setTimerExercise(exercise.name);
    setTimerRunning(true);
  }

  async function saveLog(log, exercise) {
    const nextComplete = !log.completed;

    if (nextComplete) {
      const weight = Number(log.weight);
      const reps = Number(log.reps);

      if (
        log.weight === "" ||
        log.reps === "" ||
        Number.isNaN(weight) ||
        Number.isNaN(reps) ||
        reps <= 0
      ) {
        setMessage("重量と回数を入れてから完了にして。");
        return;
      }
    }

    editLog(log.id, "saving", true);

    try {
      const res = await fetch("/api/logs", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...log,
          completed: nextComplete,
          pageId: log.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "セットを保存できなかった。");
      }

      setLogs((current) =>
        current.map((item) =>
          item.id === log.id
            ? {
                ...item,
                completed: nextComplete,
                saving: false,
              }
            : item
        )
      );

      if (nextComplete) {
        startRestTimer(exercise);
      }
    } catch (error) {
      editLog(log.id, "saving", false);
      setMessage(error.message);
    }
  }

  async function finishWorkout() {
    setBusy(true);
    setMessage("");

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "同期できなかった。");
      }

      setMessage(
        `同期完了：前回記録 ${data.updated || 0}種目 / PR ${
          data.created || 0
        }件`
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function exerciseVolume(exerciseLogs) {
    return exerciseLogs.reduce((total, log) => {
      if (!log.completed) return total;

      return (
        total +
        (Number(log.weight) || 0) *
          (Number(log.reps) || 0)
      );
    }, 0);
  }

  function formatTimer(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return (
    <main>
      <header>
        <div className="eyebrow">DAICHI TRAINING v2</div>

        <h1>
          {workout ? `${workout.part} Day` : "今日はどこやる？"}
        </h1>

        {workout && (
          <div className="date">{workout.date}</div>
        )}
      </header>

      {!workout && (
        <>
          <section className="parts">
            {PARTS.map((value) => (
              <button
                key={value}
                className={
                  part === value ? "part active" : "part"
                }
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
                const previousSets =
                  getExercisePrevious(exercise);

                return (
                  <div
                    className="previewRow"
                    key={exercise.id}
                  >
                    <div>
                      <strong>{exercise.name}</strong>

                      <small>
                        前回：
                        {previousSets.length > 0
                          ? previousSets
                              .map(
                                (set) =>
                                  `${set.weight}kg×${set.reps}`
                              )
                              .join(" / ")
                          : exercise.previous || "記録なし"}
                      </small>
                    </div>

                    <span>{exercise.sets} sets</span>
                  </div>
                );
              })}

              <button
                className="primary"
                onClick={startWorkout}
                disabled={busy}
              >
                {busy
                  ? "作成中…"
                  : `${part} Dayを開始`}
              </button>
            </section>
          )}
        </>
      )}

      {workout && (
        <>
          <section className="summaryBar">
            <div>
              <small>完了セット</small>
              <strong>
                {completedSets}/{totalSets}
              </strong>
            </div>

            <div>
              <small>総ボリューム</small>
              <strong>
                {formatVolume(totalVolume)} kg
              </strong>
            </div>
          </section>

          <section className="workout">
            {grouped.map(
              ({ exercise, logs: exerciseLogs }) => {
                const previousSets =
                  getExercisePrevious(exercise);

                const volume =
                  exerciseVolume(exerciseLogs);

                return (
                  <article
                    className="card exercise"
                    key={exercise.id}
                  >
                    <div className="exerciseHead">
                      <div>
                        <h2>{exercise.name}</h2>

                        <p>
                          {previousSets.length > 0
                            ? `前回：${previousSets
                                .map(
                                  (set) =>
                                    `${set.weight}kg×${set.reps}`
                                )
                                .join(" / ")}`
                            : `前回：${
                                exercise.previous ||
                                "記録なし"
                              }`}
                        </p>
                      </div>

                      <span>
                        {formatVolume(volume)} kg
                      </span>
                    </div>

                    {(exercise.startWeight ||
                      exercise.rest ||
                      exercise.memo) && (
                      <div className="hint">
                        {exercise.startWeight && (
                          <span>
                            目安 {exercise.startWeight}
                          </span>
                        )}

                        {Number(exercise.rest) > 0 && (
                          <span>
                            休憩 {exercise.rest}秒
                          </span>
                        )}

                        {exercise.memo && (
                          <small>{exercise.memo}</small>
                        )}
                      </div>
                    )}

                    <div className="setHeader">
                      <span>SET</span>
                      <span>KG</span>
                      <span>REPS</span>
                      <span>RIR</span>
                      <span></span>
                    </div>

                    {exerciseLogs.map((log) => (
                      <div
                        className={
                          log.completed
                            ? "setBlock done"
                            : "setBlock"
                        }
                        key={log.id}
                      >
                        <div className="setRow">
                          <b>{log.setNo}</b>

                          <input
                            inputMode="decimal"
                            placeholder="kg"
                            value={log.weight}
                            disabled={log.completed}
                            onChange={(event) =>
                              editLog(
                                log.id,
                                "weight",
                                event.target.value
                              )
                            }
                          />

                          <input
                            inputMode="numeric"
                            placeholder="回"
                            value={log.reps}
                            disabled={log.completed}
                            onChange={(event) =>
                              editLog(
                                log.id,
                                "reps",
                                event.target.value
                              )
                            }
                          />

                          <div className="rirValue">
                            {log.rir === ""
                              ? "−"
                              : log.rir}
                          </div>

                          <button
                            className="check"
                            disabled={log.saving}
                            onClick={() =>
                              saveLog(log, exercise)
                            }
                          >
                            {log.saving
                              ? "…"
                              : log.completed
                              ? "✓"
                              : "○"}
                          </button>
                        </div>

                        {!log.completed && (
                          <div className="setTools">
                            <button
                              className="previousButton"
                              onClick={() =>
                                copyPrevious(log)
                              }
                              disabled={
                                !log.previousWeight &&
                                !log.previousReps
                              }
                            >
                              前回{" "}
                              {log.previousWeight
                                ? `${log.previousWeight}kg`
                                : "−"}
                              ×
                              {log.previousReps || "−"}
                            </button>

                            <div className="rirButtons">
                              {[0, 1, 2, 3, 4].map(
                                (value) => (
                                  <button
                                    key={value}
                                    className={
                                      String(value) ===
                                      String(log.rir)
                                        ? "rirButton active"
                                        : "rirButton"
                                    }
                                    onClick={() =>
                                      selectRir(
                                        log.id,
                                        value
                                      )
                                    }
                                  >
                                    {value}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </article>
                );
              }
            )}

            <button
              className="primary finish"
              onClick={finishWorkout}
              disabled={busy}
            >
              {busy
                ? "同期中…"
                : "トレ終了・記録を同期"}
            </button>

            <a
              className="notionLink"
              href={workout.url}
              target="_blank"
              rel="noreferrer"
            >
              NotionでWorkoutを開く
            </a>
          </section>
        </>
      )}

      {timerRunning && (
        <section className="restTimer">
          <div>
            <small>
              REST
              {timerExercise
                ? `・${timerExercise}`
                : ""}
            </small>

            <strong>
              {formatTimer(timerSeconds)}
            </strong>
          </div>

          <button
            onClick={() =>
              setTimerSeconds(
                (current) => current + 30
              )
            }
          >
            +30秒
          </button>

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

      {busy && exercises.length === 0 && (
        <div className="loader">
          読み込み中…
        </div>
      )}

      {message && (
        <div
          className="toast"
          onClick={() => setMessage("")}
        >
          {message}
        </div>
      )}
    </main>
  );
}
