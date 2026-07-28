"use client";

import { useMemo, useState } from "react";

const PARTS = ["胸", "背中", "肩", "腕", "脚"];

export default function Home() {
  const [part, setPart] = useState("");
  const [exercises, setExercises] = useState([]);
  const [workout, setWorkout] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const grouped = useMemo(() => {
    const map = new Map();
    for (const exercise of exercises) {
      map.set(exercise.id, {
        exercise,
        logs: logs.filter(log => log.exerciseId === exercise.id)
      });
    }
    return [...map.values()];
  }, [exercises, logs]);

  async function selectPart(value) {
    setBusy(true); setMessage(""); setWorkout(null); setLogs([]); setPart(value);
    try {
      const res = await fetch(`/api/exercises?part=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExercises(data.exercises);
    } catch (error) {
      setMessage(error.message);
    } finally { setBusy(false); }
  }

  async function startWorkout() {
    setBusy(true); setMessage("");
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
      setMessage("Workoutを作成したで。");
    } catch (error) {
      setMessage(error.message);
    } finally { setBusy(false); }
  }

  function editLog(id, key, value) {
    setLogs(current => current.map(log => log.id === id ? { ...log, [key]: value } : log));
  }

  async function saveLog(log) {
    const nextComplete = !log.completed;
    if (nextComplete && (!log.reps || log.weight === "")) {
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
      setLogs(current => current.map(x => x.id === log.id
        ? { ...x, completed: nextComplete, saving: false }
        : x));
    } catch (error) {
      editLog(log.id, "saving", false);
      setMessage(error.message);
    }
  }

  async function finishWorkout() {
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`同期完了：前回記録 ${data.updated}種目 / PR ${data.created}件`);
    } catch (error) {
      setMessage(error.message);
    } finally { setBusy(false); }
  }

  return (
    <main>
      <header>
        <div className="eyebrow">DAICHI TRAINING</div>
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
        <section className="workout">
          {grouped.map(({ exercise, logs: exerciseLogs }) => (
            <article className="card exercise" key={exercise.id}>
              <div className="exerciseHead">
                <div>
                  <h2>{exercise.name}</h2>
                  <p>前回：{exercise.previous}</p>
                </div>
                <span>{exercise.reps || `${exercise.sets} sets`}</span>
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
              {exerciseLogs.map(log => (
                <div className={log.completed ? "setRow done" : "setRow"} key={log.id}>
                  <b>{log.setNo}</b>
                  <input inputMode="decimal" placeholder="kg" value={log.weight}
                    disabled={log.completed}
                    onChange={e => editLog(log.id, "weight", e.target.value)} />
                  <input inputMode="numeric" placeholder="回" value={log.reps}
                    disabled={log.completed}
                    onChange={e => editLog(log.id, "reps", e.target.value)} />
                  <input inputMode="decimal" placeholder="RIR" value={log.rir}
                    disabled={log.completed}
                    onChange={e => editLog(log.id, "rir", e.target.value)} />
                  <button className="check" disabled={log.saving} onClick={() => saveLog(log)}>
                    {log.saving ? "…" : log.completed ? "✓" : "○"}
                  </button>
                </div>
              ))}
            </article>
          ))}
          <button className="primary finish" onClick={finishWorkout} disabled={busy}>
            {busy ? "同期中…" : "トレ終了・記録を同期"}
          </button>
          <a className="notionLink" href={workout.url} target="_blank" rel="noreferrer">
            NotionでWorkoutを開く
          </a>
        </section>
      )}

      {busy && !exercises.length && <div className="loader">読み込み中…</div>}
      {message && <div className="toast" onClick={() => setMessage("")}>{message}</div>}
    </main>
  );
}
