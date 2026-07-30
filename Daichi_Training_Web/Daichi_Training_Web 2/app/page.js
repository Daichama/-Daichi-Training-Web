"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const PARTS = ["胸", "背中", "肩", "腕", "脚"];
const RIR_VALUES = [0, 1, 2, 3, 4];

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Home() {
  const [part, setPart] = useState("");
  const [exercises, setExercises] = useState([]);
  const [workout, setWorkout] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [timer, setTimer] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!timer || timer.remaining <= 0) return;
    timerRef.current = window.setInterval(() => {
      setTimer(current => {
        if (!current || current.remaining <= 1) {
          window.clearInterval(timerRef.current);
          if (navigator.vibrate) navigator.vibrate([180, 100, 180]);
          return current ? { ...current, remaining: 0 } : null;
        }
        return { ...current, remaining: current.remaining - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timerRef.current);
  }, [timer?.startedAt]);

  const grouped = useMemo(() => exercises.map(exercise => ({
    exercise,
    logs: logs.filter(log => log.exerciseId === exercise.id)
  })), [exercises, logs]);

  const completedLogs = useMemo(() => logs.filter(log => log.completed), [logs]);
  const totalVolume = useMemo(() => completedLogs.reduce(
    (sum, log) => sum + numeric(log.weight) * numeric(log.reps), 0
  ), [completedLogs]);

  async function selectPart(value) {
    setBusy(true);
    setMessage("");
    setWorkout(null);
    setLogs([]);
    setPart(value);
    setTimer(null);
    try {
      const res = await fetch(`/api/exercises?part=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExercises(data.exercises);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part, exercises })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkout(data.workout);
      setLogs(data.logs);
      setMessage("Workoutを作成したで。前回値を入れてあるから、そのまま調整してな。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function editLog(id, key, value) {
    setLogs(current => current.map(log => log.id === id ? { ...log, [key]: value } : log));
  }

  function copyPrevious(log) {
    if (!log.previousSet) return;
    setLogs(current => current.map(item => item.id === log.id ? {
      ...item,
      weight: String(log.previousSet.weight ?? ""),
      reps: String(log.previousSet.reps ?? "")
    } : item));
  }

  function startRest(exercise) {
    const seconds = Number(exercise.rest) > 0 ? Number(exercise.rest) : 90;
    setTimer({
      exerciseName: exercise.name,
      remaining: seconds,
      total: seconds,
      startedAt: Date.now()
    });
  }

  async function saveLog(log, exercise) {
    const nextComplete = !log.completed;
    if (nextComplete && (numeric(log.reps) <= 0 || log.weight === "")) {
      setMessage("重量と回数を入れてから完了にして。");
      return;
    }
    editLog(log.id, "saving", true);
    try {
      const res = await fetch("/api/logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...log, completed: nextComplete, pageId: log.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogs(current => current.map(item => item.id === log.id ? {
        ...item,
        completed: nextComplete,
        saving: false,
        volume: data.volume,
        e1rm: data.e1rm
      } : item));
      if (nextComplete) startRest(exercise);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: workout?.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`同期完了：前回記録 ${data.updated}種目 / 新規PR ${data.created}件`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <div className="eyebrow">DAICHI TRAINING v2</div>
        <h1>{workout ? `${workout.part} Day` : "今日はどこやる？"}</h1>
        {workout && <div className="date">{workout.date}</div>}
      </header>

      {!workout && (
        <>
          <section className="parts">
            {PARTS.map(value => (
              <button key={value} className={part === value ? "part active" : "part"}
                onClick={() => selectPart(value)} disabled={busy}>
                {value}
              </button>
            ))}
          </section>

          {exercises.length > 0 && (
            <section className="preview card">
              {exercises.map(ex => (
                <div className="previewRow" key={ex.id}>
                  <div>
                    <strong>{ex.name}</strong>
                    <small>前回：{ex.previous}</small>
                  </div>
                  <span>{ex.sets} sets</span>
                </div>
              ))}
              <button className="primary" onClick={startWorkout} disabled={busy}>
                {busy ? "作成中…" : `${part} Dayを開始`}
              </button>
            </section>
          )}
        </>
      )}

      {workout && (
        <>
          <section className="workout">
            {grouped.map(({ exercise, logs: exerciseLogs }) => {
              const exerciseVolume = exerciseLogs.filter(x => x.completed).reduce(
                (sum, x) => sum + numeric(x.weight) * numeric(x.reps), 0
              );
              return (
                <article className="card exercise" key={exercise.id}>
                  <div className="exerciseHead">
                    <div>
                      <h2>{exercise.name}</h2>
                      <p>前回：{exercise.previous}</p>
                    </div>
                    <div className="exerciseMeta">
                      <span>{exercise.reps || `${exercise.sets} sets`}</span>
                      <small>{Math.round(exerciseVolume).toLocaleString()} kg</small>
                    </div>
                  </div>

                  {(exercise.startWeight || exercise.rest || exercise.memo) && (
                    <div className="hint">
                      {exercise.startWeight && <span>目安 {exercise.startWeight}</span>}
                      {exercise.rest > 0 && <span>休憩 {exercise.rest}秒</span>}
                      {exercise.memo && <small>{exercise.memo}</small>}
                    </div>
                  )}

                  <div className="setHeader">
                    <span>SET</span><span>KG</span><span>REPS</span><span>RIR</span><span></span>
                  </div>

                  {exerciseLogs.map(log => {
                    const currentVolume = numeric(log.weight) * numeric(log.reps);
                    const currentE1rm = numeric(log.weight) * (1 + numeric(log.reps) / 30);
                    const weightPR = numeric(log.weight) > numeric(exercise.bestWeight);
                    const e1rmPR = currentE1rm > numeric(exercise.bestE1rm);
                    const volumePR = currentVolume > numeric(exercise.bestVolume);
                    const isPR = log.completed && (weightPR || e1rmPR || volumePR);
                    const previous = log.previousSet;
                    const deltaWeight = previous ? numeric(log.weight) - numeric(previous.weight) : 0;
                    const deltaReps = previous ? numeric(log.reps) - numeric(previous.reps) : 0;

                    return (
                      <div className={log.completed ? "setBlock done" : "setBlock"} key={log.id}>
                        <div className="setRow">
                          <b>{log.setNo}</b>
                          <input inputMode="decimal" aria-label="重量" value={log.weight}
                            disabled={log.completed}
                            onChange={e => editLog(log.id, "weight", e.target.value)} />
                          <input inputMode="numeric" aria-label="回数" value={log.reps}
                            disabled={log.completed}
                            onChange={e => editLog(log.id, "reps", e.target.value)} />
                          <div className="rirValue">{log.rir === "" ? "—" : log.rir}</div>
                          <button className="check" disabled={log.saving} onClick={() => saveLog(log, exercise)}>
                            {log.saving ? "…" : log.completed ? "✓" : "○"}
                          </button>
                        </div>

                        {!log.completed && (
                          <div className="setTools">
                            <button className="previousChip" onClick={() => copyPrevious(log)} disabled={!previous}>
                              前回 {previous ? `${previous.weight}kg × ${previous.reps}` : "なし"}
                            </button>
                            <div className="rirButtons" aria-label="RIR選択">
                              {RIR_VALUES.map(value => (
                                <button key={value} className={String(log.rir) === String(value) ? "active" : ""}
                                  onClick={() => editLog(log.id, "rir", String(value))}>
                                  {value}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {log.completed && (
                          <div className="setResult">
                            <span>{Math.round(currentVolume).toLocaleString()} kg</span>
                            {previous && <span>{deltaWeight === 0 ? "" : `${deltaWeight > 0 ? "+" : ""}${deltaWeight}kg `}{deltaReps === 0 ? "" : `${deltaReps > 0 ? "+" : ""}${deltaReps}rep`}</span>}
                            {isPR && <strong>PR</strong>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </article>
              );
            })}

            <button className="primary finish" onClick={finishWorkout} disabled={busy}>
              {busy ? "同期中…" : "トレ終了・記録を同期"}
            </button>
            <a className="notionLink" href={workout.url} target="_blank" rel="noreferrer">
              NotionでWorkoutを開く
            </a>
          </section>

          <div className="volumeBar">
            <div><small>完了</small><strong>{completedLogs.length}/{logs.length} sets</strong></div>
            <div><small>総ボリューム</small><strong>{Math.round(totalVolume).toLocaleString()} kg</strong></div>
          </div>
        </>
      )}

      {timer && (
        <div className={timer.remaining === 0 ? "timer done" : "timer"}>
          <button className="timerClose" onClick={() => setTimer(null)}>×</button>
          <small>{timer.remaining === 0 ? "次いこ" : `${timer.exerciseName} 休憩`}</small>
          <strong>{formatTime(timer.remaining)}</strong>
          <div className="timerActions">
            <button onClick={() => setTimer(current => current ? { ...current, remaining: current.remaining + 30 } : null)}>+30秒</button>
            <button onClick={() => setTimer(null)}>終了</button>
          </div>
        </div>
      )}

      {busy && !exercises.length && <div className="loader">読み込み中…</div>}
      {message && <div className="toast" onClick={() => setMessage("")}>{message}</div>}
    </main>
  );
}
