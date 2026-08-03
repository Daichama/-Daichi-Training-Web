"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const PARTS = ["胸", "背中", "肩", "腕", "脚"];
const DRAFT_KEY = "d-log-v8-0-0-draft";
const PLAN_KEY = "d-log-v8-weekly-plan";
const REST_SECONDS = 80;

function DLogo({ className = "dLogo" }) {
  return (
    <img
      className={className}
      src="/icon.svg"
      alt="D-log"
      width="28"
      height="28"
      draggable="false"
    />
  );
}

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
          : "1",
      previousWeight: previous?.weight || "",
      previousReps: previous?.reps || "",
      extraReps: log.extraReps ?? "",
      plannedRest: Number(log.plannedRest) || 0,
      actualRest: Number(log.actualRest) || 0,
      restDelta: Number(log.restDelta) || 0,
      restReason: log.restReason || "",
      readyScore: log.readyScore || "",
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
      rir: "1",
      extraReps: "",
      plannedRest: 0,
      actualRest: 0,
      restDelta: 0,
      restReason: "",
      readyScore: "",
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
  const [sessionMemo, setSessionMemo] = useState("");
  const [exerciseNotes, setExerciseNotes] = useState({});
  const [variant, setVariant] = useState("standard");
  const [allExercises, setAllExercises] = useState([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExercisePart, setNewExercisePart] = useState("");
  const [newExerciseSets, setNewExerciseSets] = useState(3);
  const [creatingExercise, setCreatingExercise] = useState(false);
  const [feedbackPulse, setFeedbackPulse] = useState(0);
  const [weeklyPlan, setWeeklyPlan] = useState([]);
  const [editingPlan, setEditingPlan] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const wakeLockRef = useRef(null);

  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerExercise, setTimerExercise] = useState("");
  const [restStartedAt, setRestStartedAt] = useState(null);
  const [restPlanned, setRestPlanned] = useState(REST_SECONDS);
  const [restSourceLogId, setRestSourceLogId] = useState(null);
  const [restTargetLogId, setRestTargetLogId] = useState(null);
  const [restReason, setRestReason] = useState("");
  const [readyScore, setReadyScore] = useState("");
  const inputRefs = useRef({});

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
          setSessionMemo(draft.sessionMemo || "");
          setExerciseNotes(draft.exerciseNotes || {});
          setVariant(draft.variant || "standard");
          setMessage("途中のWorkoutを復元したで。");
        }
      }
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    } finally {
      setDraftChecked(true);
    }
  }, []);

  async function refreshWeeklyPlan() {
    try {
      const response = await fetch("/api/schedule", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "予定を読み込めなかった。");
      const serverDays = Array.isArray(data.days) ? data.days : [];
      let localDays = [];
      try { localDays = JSON.parse(window.localStorage.getItem(PLAN_KEY) || "[]"); } catch {}
      const localMap = new Map((Array.isArray(localDays) ? localDays : []).map((day) => [day.date, day.menu]));
      setWeeklyPlan(serverDays.map((day) => ({ ...day, menu: localMap.get(day.date) || day.menu || "休み" })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予定の読み込みに失敗したで。");
    }
  }


  function changePlanDay(date, menu) {
    setWeeklyPlan((current) => current.map((day) => day.date === date ? { ...day, menu } : day));
  }

  async function saveWeeklyPlan() {
    setSavingPlan(true);
    try {
      window.localStorage.setItem(PLAN_KEY, JSON.stringify(weeklyPlan.map(({date, menu}) => ({date, menu}))));
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: weeklyPlan.map(({ date, menu }) => ({ date, menu })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && data?.code !== "LOCAL_ONLY") throw new Error(data.error || "予定の同期に失敗したで。");
      setEditingPlan(false);
      setMessage(data?.synced ? "週間予定を保存・同期したで。" : "週間予定をこの端末に保存したで。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予定の保存に失敗したで。");
    } finally { setSavingPlan(false); }
  }

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
    refreshWeeklyPlan();
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
      JSON.stringify({ part, exercises, workout, logs, sessionMemo, exerciseNotes, variant })
    );
  }, [draftChecked, part, exercises, workout, logs, sessionMemo, exerciseNotes, variant]);

  useEffect(() => {
    if (!message) return;
    const timeoutId = window.setTimeout(() => setMessage(""), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    if (!workout || workout.saved || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let cancelled = false;

    async function requestWakeLock() {
      try {
        if (document.visibilityState !== "visible") return;
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // 対応外・拒否時は通常の自動ロックに任せる。
      }
    }

    requestWakeLock();
    const handleVisibility = () => {
      if (!cancelled && document.visibilityState === "visible" && !wakeLockRef.current) requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release?.().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [workout?.id, workout?.saved]);

  function haptic(pattern = 18) {
    // Android/Chromiumでは振動。iPhone Safari/PWAはVibration API非対応なので、
    // CSSの短い押下フィードバックを必ず併用する。
    setFeedbackPulse((value) => value + 1);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  }

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

  const activeLogId = useMemo(() => {
    for (const exercise of exercises) {
      const next = logs
        .filter((log) => log.exerciseId === exercise.id)
        .sort((a, b) => Number(a.setNo) - Number(b.setNo))
        .find((log) => !log.completed);
      if (next) return next.id;
    }
    return null;
  }, [exercises, logs]);

  const totalVolume = useMemo(() => {
    return logs.reduce((total, log) => {
      if (!log.completed) return total;
      return total + (Number(log.weight) || 0) * ((Number(log.reps) || 0) + (Number(log.extraReps) || 0));
    }, 0);
  }, [logs]);

  function applyVariant(items, selectedVariant) {
    if (selectedVariant === "short") {
      return items.slice(0, 4).map((item) => ({ ...item, sets: Math.min(2, Number(item.sets) || 2) }));
    }
    if (selectedVariant === "home") {
      const homeFriendly = items.filter((item) => !/(マシン|スミス|ケーブル|ライナー|ハック|レッグプレス)/i.test(item.name));
      return (homeFriendly.length ? homeFriendly : items.slice(0, 4)).map((item) => ({ ...item, sets: Math.min(3, Number(item.sets) || 3) }));
    }
    return items;
  }

  async function selectPart(value, selectedVariant = variant) {
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

      const nextExercises = applyVariant(data.exercises || [], selectedVariant);
      setExercises(nextExercises);
      setExerciseNotes(Object.fromEntries(nextExercises.map((item) => [item.id, item.memo || ""])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "読み込みに失敗したで。");
    } finally {
      setBusy(false);
    }
  }

  async function changeVariant(nextVariant) {
    setVariant(nextVariant);
    if (part) await selectPart(part, nextVariant);
  }

  async function openExercisePicker() {
    try {
      const response = await fetch("/api/exercises?all=1", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "種目一覧を取得できなかった。");
      setAllExercises(data.exercises || []);
      setShowExercisePicker(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "種目一覧の取得に失敗したで。");
    }
  }

  function addExercise(exercise) {
    if (exercises.some((item) => item.id === exercise.id)) {
      setMessage("その種目はもう入ってるで。");
      return;
    }

    const addedExercise = { ...exercise, sets: Number(exercise.sets) || 3 };
    setExercises((current) => [...current, addedExercise]);

    if (workout && !workout.saved) {
      const addedLogs = hydrateLogs([addedExercise], createDraftLogs([addedExercise]));
      setLogs((current) => [...current, ...addedLogs]);
      setMessage(`${exercise.name}を今日のWorkoutに追加したで。`);
    }

    setShowExercisePicker(false);
  }


  async function createNewExercise() {
    const name = newExerciseName.trim();
    const exercisePart = newExercisePart || part;
    if (!name) {
      setMessage("種目名を入力してな。");
      return;
    }
    if (!exercisePart) {
      setMessage("部位を選んでな。");
      return;
    }

    setCreatingExercise(true);
    try {
      const response = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, part: exercisePart, sets: newExerciseSets }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "新しい種目を作れなかった。");
      addExercise(data.exercise);
      setAllExercises((current) => current.some((item) => item.id === data.exercise.id) ? current : [...current, data.exercise]);
      setNewExerciseName("");
      setNewExercisePart("");
      setNewExerciseSets(3);
      setMessage(data.existed ? `${data.exercise.name}は既に登録済みやったので追加したで。` : `${data.exercise.name}を新規登録して追加したで。`);
      haptic([18, 35, 24]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新しい種目の作成に失敗したで。");
    } finally {
      setCreatingExercise(false);
    }
  }

  function skipExercise(exerciseId) {
    if (!window.confirm("今日だけこの種目をスキップする？")) return;
    setExercises((current) => current.filter((item) => item.id !== exerciseId));
    setLogs((current) => current.filter((log) => log.exerciseId !== exerciseId));
  }

  function moveExercise(exerciseId, direction) {
    setExercises((current) => {
      const index = current.findIndex((item) => item.id === exerciseId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
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
    editLog(logId, "rir", value === "" ? "" : String(value));
  }

  function changeExerciseSetCount(exerciseId, delta) {
    if (workout?.saved) return;
    setLogs((current) => {
      const exerciseLogs = current.filter((log) => log.exerciseId === exerciseId);
      if (delta < 0) {
        if (exerciseLogs.length <= 1) return current;
        const removable = [...exerciseLogs].reverse().find((log) => !log.completed);
        if (!removable) {
          setMessage("完了済みセットは減らせへんで。");
          return current;
        }
        return current.filter((log) => log.id !== removable.id);
      }
      const last = exerciseLogs[exerciseLogs.length - 1];
      const nextNo = exerciseLogs.length + 1;
      return [...current, {
        id: `draft-${exerciseId}-${Date.now()}`,
        exerciseId,
        setNo: nextNo,
        completed: false,
        weight: last?.weight || last?.previousWeight || "",
        reps: last?.reps || last?.previousReps || "",
        rir: "1",
        extraReps: "",
        previousWeight: last?.previousWeight || "",
        previousReps: last?.previousReps || "",
        plannedRest: 0,
        actualRest: 0,
        restDelta: 0,
        restReason: "",
        readyScore: "",
        saving: false,
      }];
    });
  }

  function findNextLog(currentLog) {
    const ordered = exercises.flatMap((exercise) =>
      logs
        .filter((item) => item.exerciseId === exercise.id)
        .sort((a, b) => Number(a.setNo) - Number(b.setNo))
    );
    const index = ordered.findIndex((item) => item.id === currentLog.id);
    return ordered.slice(index + 1).find((item) => !item.completed) || null;
  }

  function startRestTimer(exercise, log) {
    const nextLog = findNextLog(log);
    setTimerSeconds(REST_SECONDS);
    setRestPlanned(REST_SECONDS);
    setRestStartedAt(Date.now());
    setRestSourceLogId(log.id);
    setRestTargetLogId(nextLog?.id || null);
    setRestReason("");
    setReadyScore("");
    setTimerExercise(exercise.name);
    setTimerRunning(true);
  }

  function extendRest(seconds) {
    setTimerSeconds((current) => Math.max(0, current) + seconds);
    setRestPlanned((current) => current + seconds);
  }

  function beginNextSet() {
    const actualRest = restStartedAt ? Math.max(0, Math.round((Date.now() - restStartedAt) / 1000)) : 0;
    setLogs((current) => current.map((item) => item.id === restSourceLogId ? {
      ...item,
      plannedRest: restPlanned,
      actualRest,
      restDelta: actualRest - REST_SECONDS,
      restReason,
      readyScore,
    } : item));
    setTimerRunning(false);
    setTimerSeconds(0);
    const targetId = restTargetLogId;
    window.setTimeout(() => {
      const refs = inputRefs.current[targetId];
      if (!refs) return;
      const target = refs.reps?.value ? refs.weight : refs.reps;
      refs.row?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => { target?.focus(); target?.select?.(); }, 250);
    }, 50);
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

    if (nextComplete) {
      const exerciseLogs = logs.filter((item) => item.exerciseId === exercise.id);
      const completesExercise = exerciseLogs.every((item) => item.id === log.id || item.completed);
      haptic(completesExercise ? [24, 55, 34] : 18);
    } else {
      haptic(10);
    }
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
      fatigue: 3,
      satisfaction: 3,
      pump: 3,
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
          sessionMemo,
          exerciseNotes,
          ratings: {
            fatigue: Number(saveConfirm.fatigue) || 0,
            satisfaction: Number(saveConfirm.satisfaction) || 0,
            pump: Number(saveConfirm.pump) || 0,
          },
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
        reps: logs.reduce((total, log) => total + (log.completed ? (Number(log.reps) || 0) + (Number(log.extraReps) || 0) : 0), 0),
        volume: totalVolume,
        prs: data.created || 0,
        savedSets: data.savedSets || 0,
      };
      setSaveConfirm(null);
      haptic([24, 55, 34, 70, 55]);
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
    setSessionMemo("");
    setExerciseNotes({});
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
      return total + (Number(log.weight) || 0) * ((Number(log.reps) || 0) + (Number(log.extraReps) || 0));
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
      <header className="brandHeader">
        <div className="brandLockup">
          <DLogo />
          <div>
            <div className="eyebrow">D-log · v8.0.0</div>
            <div className="brandTagline">MEASURE. IMPROVE. REPEAT.</div>
          </div>
        </div>
        <h1>{workout ? `${workout.part} Day` : "今日はどこやる？"}</h1>
        {!workout && <p className="heroCopy">日々の積み重ねが、未来をつくる。</p>}
        {workout && <div className="date">{workout.date}</div>}
      </header>

      {!workout && (
        <>
          <section className="dashboard card">
            <div><small>今月のトレ</small><strong>{monthWorkouts}回</strong></div>
            <div><small>今月の時間</small><strong>{monthMinutes}分</strong></div>
            <div><small>今月のボリューム</small><strong>{formatVolume(monthVolume)}kg</strong></div>
          </section>
          <section className="weeklyPlan card">
            <div className="weeklyPlanHead">
              <div><small>WEEKLY PLAN</small><span>今週の予定</span></div>
              <button className="planEditButton" onClick={() => editingPlan ? saveWeeklyPlan() : setEditingPlan(true)} disabled={savingPlan}>{editingPlan ? (savingPlan ? "保存中…" : "保存") : "変更"}</button>
            </div>
            <div className="weeklyPlanDays">
              {weeklyPlan.map((day) => (
                <div key={day.date} className={day.today ? "weeklyPlanDay today" : "weeklyPlanDay"}>
                  <span>{day.weekday}</span>
                  <em>{Number(day.date.slice(8))}</em>
                  {editingPlan ? (
                    <select value={day.menu || "休み"} onChange={(event) => changePlanDay(day.date, event.target.value)}>
                      {[...PARTS, "休み"].map((menu) => <option key={menu} value={menu}>{menu}</option>)}
                    </select>
                  ) : <strong>{day.menu || "休み"}</strong>}
                </div>
              ))}
            </div>
            {editingPlan && <button className="planCancelButton" onClick={() => { setEditingPlan(false); refreshWeeklyPlan(); }}>キャンセル</button>}
          </section>
          <section className="variantSelector card">
            {[{id:"standard",label:"Standard"},{id:"short",label:"Short"},{id:"home",label:"Home"}].map((item) => (
              <button key={item.id} className={variant === item.id ? "active" : ""} onClick={() => changeVariant(item.id)}>{item.label}</button>
            ))}
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
              {exercises.map((exercise, exerciseIndex) => {
                const previousSets = getExercisePrevious(exercise);
                return (
                  <div className="previewRow" key={exercise.id}>
                    <div>
                      <strong>{exerciseIndex + 1}. {exercise.name}</strong>
                      <small>
                        前回：
                        {previousSets.length > 0
                          ? previousSets
                              .map((set) => `${set.weight}kg×${set.reps}`)
                              .join(" / ")
                          : exercise.previous || "記録なし"}
                      </small>
                    </div>
                    <div className="previewActions"><span>{exercise.sets} sets</span><button className="previewDelete" onClick={() => skipExercise(exercise.id)} aria-label={`${exercise.name}を削除`}>削除</button></div>
                  </div>
                );
              })}

              <button className="secondary addExercisePreview" onClick={openExercisePicker}>＋ 種目を追加</button>
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

          <section className="sessionMemo card">
            <label>トレ全体メモ</label>
            <textarea value={sessionMemo} disabled={workout.saved} onChange={(e) => setSessionMemo(e.target.value)} placeholder="体調、痛み、睡眠、今日の狙いなど" />
          </section>

          <section className="workout">
            {grouped.map(({ exercise, logs: exerciseLogs }, exerciseIndex) => {
              const previousSets = getExercisePrevious(exercise);
              const volume = exerciseVolume(exerciseLogs);

              return (
                <article className="card exercise" key={exercise.id}>
                  <div className="exerciseHead">
                    <div>
                      <div className="exerciseTitleRow">
                        <h2>{exerciseIndex + 1}. {exercise.name}</h2>
                        {!workout.saved && (
                          <div className="exerciseActions">
                            <button onClick={() => moveExercise(exercise.id, -1)}>↑</button>
                            <button onClick={() => moveExercise(exercise.id, 1)}>↓</button>
                            <button className="skip" onClick={() => skipExercise(exercise.id)}>Skip</button>
                          </div>
                        )}
                        {!workout.saved && (
                          <div className="setStepper">
                            <button onClick={() => changeExerciseSetCount(exercise.id, -1)}>−</button>
                            <span>{exerciseLogs.length}</span>
                            <button onClick={() => changeExerciseSetCount(exercise.id, 1)}>＋</button>
                          </div>
                        )}
                      </div>
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

                  <div className="exerciseProgress" aria-label={`${exerciseLogs.filter((item) => item.completed).length}/${exerciseLogs.length}セット完了`}>
                    <div><span style={{ width: `${exerciseLogs.length ? (exerciseLogs.filter((item) => item.completed).length / exerciseLogs.length) * 100 : 0}%` }} /></div>
                    <small>{exerciseLogs.filter((item) => item.completed).length}/{exerciseLogs.length} SETS</small>
                  </div>

                  <label className="exerciseMemoLabel">次回にも引き継ぐメモ</label>
                  <textarea className="exerciseMemo" value={exerciseNotes[exercise.id] || ""} disabled={workout.saved} onChange={(e) => setExerciseNotes((current) => ({...current, [exercise.id]: e.target.value}))} placeholder="フォーム、マシン設定、次回の目標などを自分で入力" />

                  <div className="setHeader">
                    <span>SET</span>
                    <span>KG</span>
                    <span>REPS</span>
                    <span>RIR</span>
                    <span></span>
                  </div>

                  {exerciseLogs.map((log) => (
                    <div
                      className={`setBlock${log.completed ? " done" : ""}${log.id === activeLogId ? " activeSet" : ""}`}
                      key={log.id}
                      ref={(node) => { inputRefs.current[log.id] = { ...(inputRefs.current[log.id] || {}), row: node }; }}
                    >
                      <div className="setRow">
                        <b>{log.setNo}</b>
                        <input
                          ref={(node) => { inputRefs.current[log.id] = { ...(inputRefs.current[log.id] || {}), weight: node }; }}
                          inputMode="decimal"
                          placeholder="kg"
                          value={log.weight}
                          disabled={log.completed || workout.saved}
                          onChange={(event) =>
                            editLog(log.id, "weight", event.target.value)
                          }
                        />
                        <input
                          ref={(node) => { inputRefs.current[log.id] = { ...(inputRefs.current[log.id] || {}), reps: node }; }}
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
                        <div className="restPauseInput">
                          <span>追加レップ</span>
                          <input inputMode="numeric" placeholder="+0" value={log.extraReps || ""} onChange={(event) => editLog(log.id, "extraReps", event.target.value)} />
                          <small>一度限界後、ショートレストして追加した回数</small>
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
                            {[{ value: "", label: "−" }, { value: 0, label: "0" }, { value: 1, label: "1" }, { value: 2, label: "2" }].map(({ value, label }) => (
                              <button
                                key={String(value)}
                                className={
                                  String(value) === String(log.rir)
                                    ? "rirButton active"
                                    : "rirButton"
                                }
                                onClick={() => selectRir(log.id, value)}
                              >
                                {label}
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

            {!workout.saved && (
              <button className="secondary addExerciseDuring" onClick={openExercisePicker}>＋ 種目を追加</button>
            )}

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
              <div className="ratingFields">
                {[{key:"fatigue",label:"しんどさ"},{key:"satisfaction",label:"充実度"},{key:"pump",label:"パンプ"}].map((rating) => (
                  <div key={rating.key}><span>{rating.label}</span><div>{[1,2,3,4,5].map((value) => <button key={value} className={Number(saveConfirm[rating.key]) === value ? "active" : ""} onClick={() => setSaveConfirm((current) => ({...current, [rating.key]: value}))}>{value}</button>)}</div></div>
                ))}
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

      {showExercisePicker && (
        <div className="modalBackdrop">
          <section className="summaryModal card exercisePicker">
            <small>ADD EXERCISE</small><h2>種目を追加</h2>
            <div className="newExerciseBox">
              <strong>新しい種目を作る</strong>
              <input value={newExerciseName} onChange={(event) => setNewExerciseName(event.target.value)} placeholder="例：ワンハンドケーブルロウ" />
              <div className="newExerciseGrid">
                <select value={newExercisePart || part} onChange={(event) => setNewExercisePart(event.target.value)}>
                  <option value="">部位</option>
                  {PARTS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <label><span>セット</span><input type="number" min="1" max="10" value={newExerciseSets} onChange={(event) => setNewExerciseSets(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} /></label>
              </div>
              <button className="primary" onClick={createNewExercise} disabled={creatingExercise}>{creatingExercise ? "登録中…" : "新規登録して追加"}</button>
            </div>
            <div className="pickerDivider"><span>登録済み種目</span></div>
            <div className="exercisePickerList">{allExercises.filter((item) => !exercises.some((current) => current.id === item.id)).map((item) => <button key={item.id} onClick={() => addExercise(item)}><strong>{item.name}</strong><span>{item.part}</span></button>)}</div>
            <button className="secondary" onClick={() => setShowExercisePicker(false)}>閉じる</button>
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
