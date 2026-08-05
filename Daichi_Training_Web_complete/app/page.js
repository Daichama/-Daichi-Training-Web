"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const PARTS = ["胸", "背中", "肩", "腕", "脚"];
const DRAFT_KEY = "d-log-v10-draft";
const BODY_KEY = "d-log-v10-body-records";
const VOLUME_GOALS_KEY = "d-log-v10-monthly-volume-goals";
const PLAN_KEY = "d-log-v9-monthly-plan";
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

function getHomeScheduleWindow(days, centerDate, radius = 6) {
  if (!Array.isArray(days) || days.length === 0) return [];
  const index = Math.max(0, days.findIndex((day) => day.date === centerDate));
  const start = Math.max(0, Math.min(index - radius, days.length - (radius * 2 + 1)));
  return days.slice(start, start + radius * 2 + 1);
}

function getCurrentWeekRange() {
  const today = todayInJapan();
  const date = new Date(`${today}T00:00:00+09:00`);
  const day = date.getDay() || 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - day + 1);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(monday);
    value.setDate(monday.getDate() + index);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  });
  return { start: dates[0], end: dates[6], dates };
}

function partTone(part) {
  return ({ "胸": "chest", "背中": "back", "肩": "shoulder", "腕": "arms", "脚": "legs", "休み": "rest" })[part] || "unset";
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
      completedAt: null,
      exerciseOrder: null,
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

function formatDurationMinutes(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  if (!total) return "—";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? `${hours}時間${minutes ? `${minutes}分` : ""}` : `${minutes}分`;
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

function extractWorkoutLocation(memo) {
  const text = String(memo || "");
  const match = text.match(/(?:場所|トレーニング場所)\s*[：:]\s*([^/\n]+)/);
  return match ? match[1].trim() : "";
}


function extractWorkoutMeta(memo) {
  const text = String(memo || "");
  const start = text.match(/開始\s*(\d{2}:\d{2})/)?.[1] || "";
  const end = text.match(/終了\s*(\d{2}:\d{2})/)?.[1] || "";
  const assessment = text.match(/評価[：:]\s*([^/\n]+)/)?.[1]?.trim() || "";
  const pump = text.match(/パンプ[：:]\s*([^/\n]+)/)?.[1]?.trim() || "";
  const location = extractWorkoutLocation(text) || "PHGノース大阪";
  const cleanMemo = text
    .replace(/開始\s*\d{2}:\d{2}\s*\/\s*終了\s*\d{2}:\d{2}/g, "")
    .replace(/\s*\/?\s*(?:評価|パンプ|場所|トレーニング場所)[：:]\s*[^/\n]+/g, "")
    .replace(/\s*\/?\s*(?:Stretch|Abs)[：:]\s*[^\n]+/g, "")
    .replace(/^\s*[\/\n]+|[\/\n]+\s*$/g, "")
    .trim();
  return { start, end, assessment, pump, location, cleanMemo };
}

function compareHistorySet(current, previous) {
  if (!current || !previous) return "";
  const cw = Number(current.weight) || 0;
  const pw = Number(previous.weight) || 0;
  const cr = Number(current.reps) || 0;
  const pr = Number(previous.reps) || 0;
  if (cw > pw || (cw === pw && cr > pr)) return "historyUp";
  if (cw < pw || (cw === pw && cr < pr)) return "historyDown";
  return "historySame";
}

function replaceWorkoutLocation(memo, location) {
  const cleaned = String(memo || "")
    .replace(/\s*\/?\s*(?:場所|トレーニング場所)\s*[：:]\s*[^/\n]+/g, "")
    .replace(/^\s*[\/\n]+|[\/\n]+\s*$/g, "")
    .trim();
  const locationText = String(location || "").trim();
  return [locationText ? `場所：${locationText}` : "", cleaned].filter(Boolean).join(" / ");
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
  const [calendarMonth, setCalendarMonth] = useState(() => todayInJapan().slice(0, 7));
  const [editingPlan, setEditingPlan] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [appView, setAppView] = useState("home");
  const [progressTab, setProgressTab] = useState("exercise");
  const [draggingPreviewIndex, setDraggingPreviewIndex] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [editingHistoryId, setEditingHistoryId] = useState("");
  const [historyDraft, setHistoryDraft] = useState(null);
  const [historyDeletedLogIds, setHistoryDeletedLogIds] = useState([]);
  const [savingHistory, setSavingHistory] = useState(false);
  const [draggingHistoryIndex, setDraggingHistoryIndex] = useState(null);
  const [expandedHistoryExercises, setExpandedHistoryExercises] = useState({});
  const [expandedHistoryMonths, setExpandedHistoryMonths] = useState({});
  const [bodyRecords, setBodyRecords] = useState([]);
  const [volumeGoals, setVolumeGoals] = useState({});
  const [bodyDraft, setBodyDraft] = useState({ date: todayInJapan(), weight: "", bodyFat: "", waist: "", arm: "", photo: "" });
  const [preWorkoutOpen, setPreWorkoutOpen] = useState(false);
  const [stretchStartedAt, setStretchStartedAt] = useState(null);
  const [stretchSeconds, setStretchSeconds] = useState(0);
  const [stretchStatus, setStretchStatus] = useState("pending");
  const [absPromptOpen, setAbsPromptOpen] = useState(false);
  const [absSets, setAbsSets] = useState([{ reps: 15, completed: false }, { reps: 15, completed: false }]);
  const [absStatus, setAbsStatus] = useState("pending");
  const historyDragRef = useRef(null);
  const previewDragRef = useRef(null);
  const wakeLockRef = useRef(null);
  const saveInFlightRef = useRef(false);


  async function beginHistoryEdit(item) {
    if (!allExercises.length) {
      try {
        const response = await fetch("/api/exercises?all=1", { cache: "no-store" });
        const data = await response.json();
        if (response.ok) setAllExercises(data.exercises || []);
      } catch {}
    }
    setEditingHistoryId(item.id);
    setExpandedHistoryExercises({});
    setHistoryDeletedLogIds([]);
    setHistoryDraft({
      ...item,
      location: extractWorkoutLocation(item.memo) || "PHGノース大阪",
      exercises: item.exercises.map((exercise) => ({
        ...exercise,
        exerciseId: exercise.id,
        part: exercise.part || item.part,
        sets: exercise.sets.map((set) => ({ ...set })),
      })),
    });
  }

  function cancelHistoryEdit() {
    setEditingHistoryId("");
    setHistoryDraft(null);
    setHistoryDeletedLogIds([]);
    setExpandedHistoryExercises({});
  }

  function toggleHistoryExercise(index) {
    setExpandedHistoryExercises((current) => ({ ...current, [index]: !current[index] }));
  }

  function reorderHistoryExercise(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    setHistoryDraft((draft) => {
      if (!draft || fromIndex < 0 || toIndex < 0 || fromIndex >= draft.exercises.length || toIndex >= draft.exercises.length) return draft;
      const exercises = [...draft.exercises];
      const [moved] = exercises.splice(fromIndex, 1);
      exercises.splice(toIndex, 0, moved);
      return { ...draft, exercises };
    });
  }

  function startHistoryExerciseDrag(event, index) {
    event.preventDefault();
    event.stopPropagation();
    historyDragRef.current = { pointerId: event.pointerId, currentIndex: index };
    setDraggingHistoryIndex(index);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveHistoryExerciseDrag(event) {
    const drag = historyDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-history-exercise-index]');
    if (!target) return;
    const targetIndex = Number(target.dataset.historyExerciseIndex);
    if (!Number.isInteger(targetIndex) || targetIndex === drag.currentIndex) return;
    reorderHistoryExercise(drag.currentIndex, targetIndex);
    drag.currentIndex = targetIndex;
    setDraggingHistoryIndex(targetIndex);
  }

  function endHistoryExerciseDrag(event) {
    const drag = historyDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    historyDragRef.current = null;
    setDraggingHistoryIndex(null);
  }

  function updateHistorySet(exerciseIndex, setIndex, key, value) {
    setHistoryDraft((draft) => {
      if (!draft) return draft;
      const exercises = draft.exercises.map((exercise, eIndex) => eIndex !== exerciseIndex ? exercise : {
        ...exercise,
        sets: exercise.sets.map((set, sIndex) => sIndex === setIndex ? { ...set, [key]: value } : set),
      });
      return { ...draft, exercises };
    });
  }

  function removeHistoryExercise(index) {
    setHistoryDraft((draft) => {
      if (!draft) return draft;
      const target = draft.exercises[index];
      setHistoryDeletedLogIds((current) => [...current, ...target.sets.map((set) => set.id).filter(Boolean)]);
      return { ...draft, exercises: draft.exercises.filter((_, i) => i !== index) };
    });
  }

  function removeHistorySet(exerciseIndex, setIndex) {
    setHistoryDraft((draft) => {
      if (!draft) return draft;
      const target = draft.exercises[exerciseIndex].sets[setIndex];
      if (target?.id) setHistoryDeletedLogIds((current) => [...current, target.id]);
      const exercises = draft.exercises.map((exercise, eIndex) => eIndex !== exerciseIndex ? exercise : {
        ...exercise,
        sets: exercise.sets.filter((_, sIndex) => sIndex !== setIndex),
      }).filter((exercise) => exercise.sets.length > 0);
      return { ...draft, exercises };
    });
  }

  function addHistorySet(exerciseIndex) {
    setHistoryDraft((draft) => {
      if (!draft) return draft;
      const exercises = draft.exercises.map((exercise, eIndex) => eIndex !== exerciseIndex ? exercise : {
        ...exercise,
        sets: [...exercise.sets, { id: `tmp-${Date.now()}`, weight: "", reps: "", rir: "", memo: "" }],
      });
      return { ...draft, exercises };
    });
  }

  function addHistoryExercise(exerciseId) {
    const exercise = allExercises.find((item) => item.id === exerciseId);
    if (!exercise || !historyDraft) return;
    if (historyDraft.exercises.some((item) => item.exerciseId === exercise.id)) return;
    setHistoryDraft((draft) => ({
      ...draft,
      exercises: [...draft.exercises, {
        id: exercise.id,
        exerciseId: exercise.id,
        name: exercise.name,
        part: exercise.part || draft.part,
        sets: [{ id: `tmp-${Date.now()}`, weight: "", reps: "", rir: "", memo: "" }],
      }],
    }));
  }

  async function createHistoryExercise() {
    if (!historyDraft) return;
    const name = window.prompt("新しい種目名を入力して");
    if (!name || !name.trim()) return;
    try {
      const response = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), part: historyDraft.part || part || "胸", sets: 1 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "種目を作成できなかった。");
      const created = data.exercise || data;
      const normalized = { id: created.id, name: created.name || name.trim(), part: created.part || historyDraft.part };
      setAllExercises((current) => current.some((item) => item.id === normalized.id) ? current : [...current, normalized]);
      setHistoryDraft((draft) => ({ ...draft, exercises: [...draft.exercises, { id: normalized.id, exerciseId: normalized.id, name: normalized.name, part: normalized.part, sets: [{ id: `tmp-${Date.now()}`, weight: "", reps: "", rir: "", memo: "" }] }] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "種目を作成できなかった。");
    }
  }

  async function deleteHistoryWorkout() {
    if (!historyDraft) return;
    if (!window.confirm(`${historyDraft.date}の${historyDraft.part}ログを丸ごと削除する？この操作は元に戻せへんで。`)) return;
    setSavingHistory(true);
    try {
      const logIds = historyDraft.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id)).filter((id) => id && !String(id).startsWith("tmp-"));
      const response = await fetch("/api/history-edit", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: historyDraft.id, logIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Workoutを削除できませんでした");
      setMessage("Workoutを削除したで。");
      setSelectedHistoryId("");
      cancelHistoryEdit();
      await loadAnalytics(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Workoutを削除できませんでした");
    } finally {
      setSavingHistory(false);
    }
  }

  async function saveHistoryEdit() {
    if (!historyDraft) return;
    setSavingHistory(true);
    try {
      const response = await fetch("/api/history-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: historyDraft.id,
          date: historyDraft.date,
          part: historyDraft.part,
          workoutMemo: replaceWorkoutLocation(historyDraft.memo || "", historyDraft.location || ""),
          exercises: historyDraft.exercises,
          deletedLogIds: historyDeletedLogIds,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "履歴を保存できませんでした");
      setMessage("履歴を更新したで。");
      cancelHistoryEdit();
      await loadAnalytics(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "履歴を保存できませんでした");
    } finally {
      setSavingHistory(false);
    }
  }

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

  async function refreshWeeklyPlan(month = calendarMonth) {
    try {
      const response = await fetch(`/api/schedule?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "予定を読み込めなかった。");
      const serverDays = Array.isArray(data.days) ? data.days : [];
      let localDays = [];
      try { localDays = JSON.parse(window.localStorage.getItem(PLAN_KEY) || "[]"); } catch {}
      const localMap = new Map((Array.isArray(localDays) ? localDays : []).map((day) => [day.date, day.menu]));
      setWeeklyPlan(serverDays.map((day) => ({ ...day, menu: localMap.has(day.date) ? localMap.get(day.date) : (day.menu || "") })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予定の読み込みに失敗したで。");
    }
  }

  function shiftCalendarMonth(delta) {
    const [year, month] = calendarMonth.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    const value = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    setCalendarMonth(value);
    setEditingPlan(false);
    refreshWeeklyPlan(value);
  }


  function changePlanDay(date, menu) {
    setWeeklyPlan((current) => current.map((day) => day.date === date ? { ...day, menu } : day));
  }

  async function saveWeeklyPlan() {
    setSavingPlan(true);
    try {
      window.localStorage.setItem(PLAN_KEY, JSON.stringify(weeklyPlan.map(({date, menu}) => ({date, menu: menu || ""}))));
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: weeklyPlan.map(({ date, menu }) => ({ date, menu: menu || "" })) }),
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
    refreshWeeklyPlan(calendarMonth);
    loadAnalytics();
    try {
      const savedBody = JSON.parse(window.localStorage.getItem(BODY_KEY) || "[]");
      if (Array.isArray(savedBody)) setBodyRecords(savedBody);
    } catch {}
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


  function reorderPreviewExercise(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    setExercises((current) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function startPreviewDrag(event, index) {
    event.preventDefault();
    previewDragRef.current = { pointerId: event.pointerId, currentIndex: index };
    setDraggingPreviewIndex(index);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    haptic(18);
  }

  function movePreviewDrag(event) {
    const drag = previewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-preview-index]');
    if (!target) return;
    const targetIndex = Number(target.dataset.previewIndex);
    if (!Number.isInteger(targetIndex) || targetIndex === drag.currentIndex) return;
    reorderPreviewExercise(drag.currentIndex, targetIndex);
    drag.currentIndex = targetIndex;
    setDraggingPreviewIndex(targetIndex);
    haptic(8);
  }

  function endPreviewDrag(event) {
    const drag = previewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    previewDragRef.current = null;
    setDraggingPreviewIndex(null);
  }

  function beginPreWorkout() {
    if (!part || exercises.length === 0) {
      setMessage("部位と種目を選んで。");
      return;
    }
    setStretchStatus("pending");
    setStretchSeconds(0);
    setStretchStartedAt(null);
    setPreWorkoutOpen(true);
  }

  function startStretch() {
    setStretchStatus("running");
    setStretchStartedAt(Date.now());
    setNow(Date.now());
  }

  function launchWorkout(nextStretchStatus = stretchStatus) {
    const finalStretchSeconds = stretchStartedAt ? Math.max(0, Math.floor((Date.now() - stretchStartedAt) / 1000)) : stretchSeconds;
    setStretchSeconds(finalStretchSeconds);
    setStretchStatus(nextStretchStatus);
    setPreWorkoutOpen(false);
    const draftLogs = hydrateLogs(exercises, createDraftLogs(exercises));
    setWorkout({
      id: null, url: "", date: todayInJapan(), part, saved: false, startedAt: Date.now(),
      sessionId: (globalThis.crypto?.randomUUID?.() || `dlog-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    });
    setNow(Date.now());
    setLogs(draftLogs);
    setMessage(nextStretchStatus === "skipped" ? "ストレッチをSkipして開始したで。" : "ストレッチ完了。トレーニング開始やで。");
  }

  function finishStretchAndStart() {
    launchWorkout("completed");
  }

  function skipStretchAndStart() {
    setStretchSeconds(0);
    launchWorkout("skipped");
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
        completedAt: null,
        exerciseOrder: exerciseLogs.find((item) => item.exerciseOrder)?.exerciseOrder || null,
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

    const completedAt = nextComplete ? Date.now() : null;
    setLogs((current) => {
      // 種目を初めて完了した瞬間に、そのWorkout内での実施順を確定する。
      // 全セットへ同じ番号を持たせることで、Notionの作成時刻やAPI処理順に依存しない。
      const existingOrder = current.find(
        (item) => item.exerciseId === exercise.id && Number(item.exerciseOrder) > 0
      )?.exerciseOrder;
      const maxOrder = current.reduce(
        (max, item) => Math.max(max, Number(item.exerciseOrder) || 0),
        0
      );
      const assignedOrder = existingOrder || (nextComplete ? maxOrder + 1 : null);

      return current.map((item) => {
        if (item.exerciseId === exercise.id && assignedOrder) {
          return item.id === log.id
            ? { ...item, completed: nextComplete, completedAt, exerciseOrder: assignedOrder }
            : { ...item, exerciseOrder: assignedOrder };
        }
        return item.id === log.id
          ? { ...item, completed: nextComplete, completedAt }
          : item;
      });
    });

    if (nextComplete) {
      const exerciseLogs = logs.filter((item) => item.exerciseId === exercise.id);
      const completesExercise = exerciseLogs.every((item) => item.id === log.id || item.completed);
      haptic(completesExercise ? [24, 55, 34] : 18);
    } else {
      haptic(10);
    }
  }

  function showSaveConfirmation() {
    setSaveConfirm({
      date: workout?.date || todayInJapan(),
      startTime: timeInJapan(workout?.startedAt || Date.now()),
      endTime: timeInJapan(Date.now()),
      assessment: "良かった",
      pump: "良い",
      location: "PHGノース大阪",
    });
  }

  function openSaveConfirmation() {
    if (completedSets === 0) { setMessage("完了したセットがないで。"); return; }
    if (workout?.saved) { setMessage("このWorkoutはもう保存済みやで。"); return; }
    if (absStatus === "pending") { setAbsPromptOpen(true); return; }
    showSaveConfirmation();
  }

  function finishAbsFlow(status) {
    setAbsStatus(status);
    setAbsPromptOpen(false);
    window.setTimeout(showSaveConfirmation, 0);
  }

  async function finishWorkout() {
    if (!saveConfirm || saveInFlightRef.current || busy) return;
    saveInFlightRef.current = true;

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
          sessionMemo: [sessionMemo, saveConfirm.location ? `場所: ${saveConfirm.location}` : "", `Stretch: ${stretchStatus === "completed" ? `${stretchSeconds}秒` : "Skip"}`, `Abs: ${absStatus === "completed" ? absSets.map((set) => `${set.reps}回`).join(" / ") : "Skip"}`].filter(Boolean).join("\n"),
          exerciseNotes,
          ratings: {
            assessment: saveConfirm.assessment || "",
            pump: saveConfirm.pump || "",
            location: saveConfirm.location || "",
          },
          startedAt: workout?.startedAt || null,
          sessionId: workout?.sessionId || null,
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
        assessment: saveConfirm.assessment || "",
        pump: saveConfirm.pump || "",
        location: saveConfirm.location || "",
        stretchSeconds,
        stretchStatus,
        absStatus,
        absSets: absSets.map((set) => ({ ...set })),
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
      saveInFlightRef.current = false;
      setBusy(false);
    }
  }


  async function loadAnalytics(force = false) {
    if (analytics && !force) return;
    setAnalyticsBusy(true);
    try {
      const response = await fetch("/api/analytics", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "記録を読み込めなかった。");
      setAnalytics(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記録を読み込めなかった。");
    } finally {
      setAnalyticsBusy(false);
    }
  }

  function openView(view) {
    setAppView(view);
    if (view === "history" || view === "progress") loadAnalytics();
  }

  async function applySmithInclineCorrection() {
    if (!window.confirm("8/1のデクライン記録をスミスインクラインプレスへ変更し、胸テンプレからデクラインを外す？")) return;
    setAnalyticsBusy(true);
    try {
      const response = await fetch("/api/corrections/2026-08-01-smith-incline", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "修正に失敗したで。");
      setMessage(data.message || "修正したで。");
      setAnalytics(null);
      await loadAnalytics(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "修正に失敗したで。");
    } finally {
      setAnalyticsBusy(false);
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
    setStretchStatus("pending"); setStretchSeconds(0); setAbsStatus("pending"); setAbsSets([{ reps: 15, completed: false }, { reps: 15, completed: false }]);
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
    setStretchStatus("pending"); setStretchSeconds(0); setAbsStatus("pending"); setAbsSets([{ reps: 15, completed: false }, { reps: 15, completed: false }]);
    setMessage("");
  }

  const elapsedSeconds = workout?.startedAt
    ? Math.max(0, Math.floor((now - Number(workout.startedAt)) / 1000))
    : 0;

  const monthWorkouts = dashboard.workouts;
  const monthMinutes = dashboard.minutes;
  const monthVolume = dashboard.volume;
  const currentWeek = getCurrentWeekRange();
  const currentWeekPlan = currentWeek.dates.map((date) => {
    const day = weeklyPlan.find((item) => item.date === date);
    const actual = (analytics?.history || []).find((item) => item.date === date);
    return { date, menu: day?.menu || "", today: date === todayInJapan(), actual };
  });
  const historyByDate = new Map((analytics?.history || []).map((item) => [item.date, item]));
  const historyMonths = Object.entries((analytics?.history || []).reduce((groups, item) => {
    const month = item.date.slice(0, 7);
    (groups[month] ||= []).push(item);
    return groups;
  }, {})).sort(([a], [b]) => b.localeCompare(a));
  const hardSetTargets = { 胸: [12, 18], 背中: [14, 20], 肩: [12, 18], 腕: [10, 16], 脚: [12, 18] };
  const volumeByPart = PARTS.map((partName) => {
    const sessions = (analytics?.history || []).filter((item) => item.part === partName && String(item.date || "").startsWith(calendarMonth));
    const volume = sessions.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    const sets = sessions.reduce((sum, item) => sum + Number(item.sets || 0), 0);
    const target = Number(volumeGoals?.[calendarMonth]?.[partName] || 0);
    const rate = target > 0 ? Math.min(100, Math.round(volume / target * 100)) : 0;
    return { part: partName, volume, sets, workouts: sessions.length, target, rate };
  });
  const nextCoachPlan = [...weeklyPlan]
    .filter((item) => item.date >= todayInJapan() && PARTS.includes(item.menu))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextCoachPart = nextCoachPlan?.menu || part || PARTS[0];
  const coachExercises = (analytics?.exercises || []).filter((item) => item.part === nextCoachPart);
  const partCoachTips = coachExercises.slice(0, 4).map((exercise) => {
    const sessions = exercise.sessions || [];
    const latest = sessions.at(-1);
    const previous = sessions.at(-2);
    if (!latest) return `${exercise.name}：まず基準記録を作ろう。`;
    if (!previous) return `${exercise.name}：次回は${latest.topSet}を基準に記録を揃えよう。`;
    const delta = Number(latest.e1rm || 0) - Number(previous.e1rm || 0);
    if (delta > 0.2) return `${exercise.name}：前回よりe1RMが${delta.toFixed(1)}kg上昇。次回も同重量で1回上積み候補。`;
    if (delta < -0.2) return `${exercise.name}：直近は${Math.abs(delta).toFixed(1)}kg低下。重量維持でフォームと回数を優先。`;
    return `${exercise.name}：直近2回は横ばい。回数を1回増やすか小幅増量を狙おう。`;
  });
  const maxPartVolume = Math.max(1, ...volumeByPart.map((item) => item.volume));
  const smartTips = (analytics?.exercises || []).map((exercise) => {
    const sessions = exercise.sessions || [];
    if (sessions.length < 2) return null;
    const latest = sessions.at(-1);
    const previous = sessions.at(-2);
    const diff = latest.e1rm - previous.e1rm;
    if (diff > 0.5) return `${exercise.name}：前回よりe1RMが${diff.toFixed(1)}kg上昇。次回は同重量で+1回か、微増量が目安。`;
    if (diff < -1) return `${exercise.name}：直近は前回未満。重量を据え置いてフォームと回数の回復を優先。`;
    return `${exercise.name}：直近2回は横ばい。次回は1セットだけ回数更新を狙おう。`;
  }).filter(Boolean).slice(0, 3);

  function openCalendarDay(day) {
    const actual = historyByDate.get(day.date);
    if (actual) {
      setSelectedHistoryId(actual.id);
      window.setTimeout(() => document.getElementById(`history-${actual.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      return;
    }
    if (!editingPlan) setEditingPlan(true);
    setMessage("予定を選んで保存してな。");
  }

  function exerciseVolume(exerciseLogs) {
    return exerciseLogs.reduce((total, log) => {
      if (!log.completed) return total;
      return total + (Number(log.weight) || 0) * ((Number(log.reps) || 0) + (Number(log.extraReps) || 0));
    }, 0);
  }

  function saveBodyRecord() {
    const next = { ...bodyDraft, id: `${bodyDraft.date}-${Date.now()}` };
    const records = [next, ...bodyRecords.filter((item) => item.date !== bodyDraft.date)].sort((a, b) => b.date.localeCompare(a.date));
    setBodyRecords(records);
    window.localStorage.setItem(BODY_KEY, JSON.stringify(records));
    setMessage("身体記録を保存したで。");
  }

  function updateHistoryExerciseName(index, name) {
    setHistoryDraft((draft) => !draft ? draft : ({ ...draft, exercises: draft.exercises.map((exercise, i) => i === index ? { ...exercise, name } : exercise) }));
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
      <header className={`brandHeader ${!workout && appView === "home" ? "homeBrandHeader" : ""}`}>
        <div className="brandLockup"><DLogo /><div><div className="eyebrow">D-log</div><div className="brandTagline">MEASURE. IMPROVE. REPEAT.</div></div></div>
        {workout && <><h1>{workout.part}</h1><div className="date">{workout.date}</div></>}
        {!workout && appView !== "home" && <h1>{appView === "history" ? "トレーニング履歴" : appView === "progress" ? "進捗" : "メニュー"}</h1>}
      </header>

      {!workout && (
        <>

          {appView === "home" && <>
          <section className="dashboard card">
            <div><small>今月のトレ</small><strong>{monthWorkouts}回</strong></div>
            <div><small>今月の時間</small><strong>{monthMinutes}分</strong></div>
            <div><small>今月のボリューム</small><strong>{formatVolume(monthVolume)}kg</strong></div>
          </section>
          <section className="weeklyPlan card">
            <div className="weeklyPlanHead">
              <div><small>今週予定</small><strong>{currentWeek.start.slice(5).replace("-", "/")}–{currentWeek.end.slice(5).replace("-", "/")}</strong></div>
              <button className="planEditButton" onClick={() => { openView("history"); setEditingPlan(true); }}>月間予定を編集</button>
            </div>
            <div className="weeklyPlanDays">
              {currentWeekPlan.map((day, index) => {
                const shownPart = day.actual?.part || day.menu;
                const isRestOnPlan = day.menu === "休み" && day.date < todayInJapan() && !day.actual;
                const isChanged = day.actual && day.menu && day.actual.part !== day.menu;
                const isMissed = day.date < todayInJapan() && day.menu && day.menu !== "休み" && !day.actual;
                return <button key={day.date} className={`weeklyPlanDay ${partTone(shownPart)}${day.today ? " today" : ""}${day.actual ? " done" : ""}${isChanged ? " changed" : ""}${isRestOnPlan ? " restOnPlan" : ""}${isMissed ? " missed" : ""}`} onClick={() => { openView("history"); if (day.actual) setSelectedHistoryId(day.actual.id); }}>
                  <span>{["月","火","水","木","金","土","日"][index]}</span>
                  <em>{Number(day.date.slice(8))}</em>
                  <strong>{shownPart || ""}</strong>
                  {day.actual && !isChanged && <i className="miniDoneStamp">済</i>}
                  {isRestOnPlan && <small>予定通り</small>}
                  {isChanged && <small>変更</small>}
                  {isMissed && <small>未実施</small>}
                </button>;
              })}
            </div>
          </section>
          <section className="variantSelector card">
            {[{id:"standard",label:"Standard"},{id:"short",label:"Short"},{id:"home",label:"Home"}].map((item) => (
              <button key={item.id} className={variant === item.id ? "active" : ""} onClick={() => changeVariant(item.id)}>{item.label}</button>
            ))}
          </section>
          <section className="parts">
            {PARTS.map((value) => (
              <button key={value} className={part === value ? "part active" : "part"} onClick={() => selectPart(value)} disabled={busy}>{value}</button>
            ))}
          </section>

          {exercises.length > 0 && (
            <section className="preview card">
              {exercises.map((exercise, exerciseIndex) => {
                const previousSets = getExercisePrevious(exercise);
                return (
                  <div className={`previewRow ${draggingPreviewIndex === exerciseIndex ? "isDragging" : ""}`} key={exercise.id} data-preview-index={exerciseIndex}>
                    <div><strong>{exerciseIndex + 1}. {exercise.name}</strong><small>前回：{previousSets.length > 0 ? previousSets.map((set) => `${set.weight}kg×${set.reps}`).join(" / ") : exercise.previous || "記録なし"}</small></div>
                    <div className="previewActions"><span>{exercise.sets} sets</span><button className="previewDragHandle" aria-label={`${exercise.name}を長押しして並べ替え`} onPointerDown={(event) => startPreviewDrag(event, exerciseIndex)} onPointerMove={movePreviewDrag} onPointerUp={endPreviewDrag} onPointerCancel={endPreviewDrag}>☰</button><button className="previewDelete" onClick={() => skipExercise(exercise.id)} aria-label={`${exercise.name}を削除`}>削除</button></div>
                  </div>
                );
              })}
              <button className="secondary addExercisePreview" onClick={openExercisePicker}>＋ 種目を追加</button>
              <button className="primary" onClick={beginPreWorkout} disabled={busy}>{`${part}を開始`}</button>
            </section>
          )}
          </>}

          {appView === "history" && (
            <section className="analyticsPage">
              <div className="analyticsHead"><div><small>HISTORY</small><h2>過去のWorkout</h2></div><button className="secondary compact" onClick={() => loadAnalytics(true)}>更新</button></div>
              <section className="monthlyPlan historyCalendar card">
                <div className="monthlyPlanHead">
                  <button onClick={() => shiftCalendarMonth(-1)} aria-label="前の月">‹</button>
                  <div><small>TRAINING CALENDAR</small><strong>{calendarMonth.replace("-", "年")}月</strong></div>
                  <button onClick={() => shiftCalendarMonth(1)} aria-label="次の月">›</button>
                </div>
                <div className="calendarLegend"><span><i className="legendPlan" />予定</span><span><i className="legendDone" />実績</span></div>
                <div className="calendarWeekdays">{["月","火","水","木","金","土","日"].map((day) => <span key={day}>{day}</span>)}</div>
                <div className="monthCalendar">
                  {Array.from({ length: weeklyPlan[0]?.offset || 0 }, (_, index) => <div className="calendarBlank" key={`blank-${index}`} />)}
                  {weeklyPlan.map((day) => {
                    const actual = historyByDate.get(day.date);
                    const plannedPart = day.menu || "";
                    const actualPart = actual?.part || "";
                    return <button type="button" key={day.date} onClick={() => openCalendarDay(day)} className={`calendarDay${day.today ? " today" : ""}${actual ? " completed" : ""}`}>
                      <div className="calendarDate"><span>{Number(day.date.slice(8))}</span></div>
                      {editingPlan ? (
                        <select value={plannedPart} onClick={(event) => event.stopPropagation()} onChange={(event) => changePlanDay(day.date, event.target.value)}>
                          <option value="">未定</option>{[...PARTS, "休み"].map((menu) => <option key={menu} value={menu}>{menu}</option>)}
                        </select>
                      ) : <>
                        {plannedPart && (!actual || plannedPart !== actualPart) && <span className={`calendarPlanTag ${partTone(plannedPart)}`}>{plannedPart}</span>}
                        {actual && <span className={`calendarActualTag ${partTone(actualPart)}`}>{actualPart}</span>}
                        {actual && <span className="doneStamp" aria-label="実施済み">済</span>}
                      </>}
                    </button>;
                  })}
                </div>
                <div className="calendarActions">
                  {editingPlan && <button className="planCancelButton" onClick={() => { setEditingPlan(false); refreshWeeklyPlan(calendarMonth); }}>キャンセル</button>}
                  <button className="planEditButton" onClick={() => editingPlan ? saveWeeklyPlan() : setEditingPlan(true)} disabled={savingPlan}>{editingPlan ? (savingPlan ? "保存中…" : "保存") : "予定を編集"}</button>
                </div>
              </section>
              {analytics?.needsSmithInclineCorrection && <div className="correctionNotice card"><span>8/1の種目名に修正候補があります。</span><button className="primary compact" onClick={applySmithInclineCorrection}>スミスインクラインプレスへ修正</button></div>}
              {analyticsBusy && <div className="loader">記録を読み込み中…</div>}
              {!analyticsBusy && analytics?.history?.length === 0 && <div className="emptyState card">まだ記録がないで。</div>}
              <div className="historyMonths">
                {historyMonths.map(([month, items], monthIndex) => {
                  const monthOpen = expandedHistoryMonths[month] ?? monthIndex === 0;
                  return <section className="historyMonth" key={month}>
                    <button className="historyMonthHead" onClick={() => setExpandedHistoryMonths((current) => ({ ...current, [month]: !monthOpen }))}>
                      <strong>{month.replace("-", "年")}月</strong><span>{items.length}回 {monthOpen ? "▲" : "▼"}</span>
                    </button>
                    {monthOpen && <div className="historyList">{items.map((item) => {
                  const open = selectedHistoryId === item.id;
                  return <article className="card historyCard" id={`history-${item.id}`} key={item.id}>
                    <button className="historySummary" onClick={() => setSelectedHistoryId(open ? "" : item.id)}>
                      <div><small>{item.date}</small><strong className={`historyPartLabel ${partTone(item.part)}`}>{item.part}</strong></div>
                      <div className="historyStats"><span>{item.sets} sets</span><span>⏱ {formatDurationMinutes(item.duration)}</span><b>{open ? "−" : "+"}</b></div>
                    </button>
                    {open && <div className="historyDetail">
                      {editingHistoryId !== item.id ? <>
                        {(() => { const meta = extractWorkoutMeta(item.memo); const previousWorkout = (analytics?.history || []).filter((row) => row.date < item.date && row.part === item.part).sort((a,b) => b.date.localeCompare(a.date))[0]; return <>
                        <div className="historyMetaBar"><div className="historyMetaStats"><span>開始 <b>{meta.start || "—"}</b></span><span>終了 <b>{meta.end || "—"}</b></span><span>評価 <b>{meta.assessment || "—"}</b></span><span>パンプ <b>{meta.pump || "—"}</b></span></div><button className="secondary compact" onClick={() => beginHistoryEdit(item)}>✏️ 編集</button></div>
                        <div className="historyTableWrap"><table className="historyTable"><thead><tr><th>種目</th>{Array.from({length: Math.max(0, ...item.exercises.map((exercise) => exercise.sets.length))}, (_, index) => <th key={index}>{index + 1}セット目</th>)}</tr></thead><tbody>{item.exercises.map((exercise, exerciseIndex) => { const previousExercise = previousWorkout?.exercises?.find((row) => row.id === exercise.id); const setCountUp = previousExercise && exercise.sets.length > previousExercise.sets.length; return <tr className={setCountUp ? "historySetCountUp" : ""} key={exercise.id}><th><span className={`historyPartDot ${partTone(item.part)}`} />{exerciseIndex + 1}. {exercise.name}{setCountUp && <small>＋セット</small>}</th>{Array.from({length: Math.max(0, ...item.exercises.map((row) => row.sets.length))}, (_, index) => { const set = exercise.sets[index]; const previousSet = previousExercise?.sets?.[index]; const trend = compareHistorySet(set, previousSet); return <td className={trend} key={index}>{set ? <><strong>{set.weight}kg×{set.reps}回</strong>{previousSet && <small>前回 {previousSet.weight}kg×{previousSet.reps}</small>}{set.rir !== "" && set.rir != null ? <small>RIR {set.rir}</small> : null}</> : <span>—</span>}</td>; })}</tr>; })}</tbody></table></div>
                        <div className="historyLocation"><span>実施場所</span><strong>{meta.location}</strong></div>
                        {meta.cleanMemo && <p className="historyMemo">{meta.cleanMemo}</p>}
                        </>; })()}
                      </> : historyDraft && <div className="historyEditor">
                        <p className="historyEditHint">☰を長押しして種目順を変更。種目名を押すとセット編集が開くで。</p>
                        {historyDraft.exercises.map((exercise, exerciseIndex) => { const expanded = Boolean(expandedHistoryExercises[exerciseIndex]); return <section data-history-exercise-index={exerciseIndex} className={`historyEditExercise ${draggingHistoryIndex === exerciseIndex ? "isDragging" : ""}`} key={exercise.exerciseId || `${exercise.name}-${exerciseIndex}`}>
                          <div className="historyEditExerciseHead"><button type="button" className="historyDragHandle" aria-label={`${exercise.name}を並び替え`} onPointerDown={(event) => startHistoryExerciseDrag(event, exerciseIndex)} onPointerMove={moveHistoryExerciseDrag} onPointerUp={endHistoryExerciseDrag} onPointerCancel={endHistoryExerciseDrag}>☰</button><button type="button" className="historyExerciseToggle" onClick={() => toggleHistoryExercise(exerciseIndex)}><strong>{exerciseIndex + 1}. {exercise.name}</strong><span>{exercise.sets.length} sets {expanded ? "▲" : "▼"}</span></button><div><button className="dangerText" onClick={() => removeHistoryExercise(exerciseIndex)}>削除</button></div></div>
                          {expanded && <div className="historyExercisePanel"><label className="historyNameEdit">種目名<input value={exercise.name || ""} onChange={(event) => updateHistoryExerciseName(exerciseIndex, event.target.value)} /></label><div className="historyEditSets">{exercise.sets.map((set, setIndex) => <div className="historyEditSet" key={set.id || setIndex}><span>Set {setIndex + 1}</span><label><input inputMode="decimal" value={set.weight ?? ""} onChange={(event) => updateHistorySet(exerciseIndex, setIndex, "weight", event.target.value)} />kg</label><label><input inputMode="numeric" value={set.reps ?? ""} onChange={(event) => updateHistorySet(exerciseIndex, setIndex, "reps", event.target.value)} />回</label><label>RIR <input inputMode="numeric" value={set.rir ?? ""} onChange={(event) => updateHistorySet(exerciseIndex, setIndex, "rir", event.target.value)} /></label><button className="historySetDelete" onClick={() => removeHistorySet(exerciseIndex, setIndex)}>×</button></div>)}</div>
                          <button className="secondary compact" onClick={() => addHistorySet(exerciseIndex)}>＋セット追加</button></div>}
                        </section>})}
                        <div className="historyAddExercise"><select defaultValue="" onChange={(event) => { addHistoryExercise(event.target.value); event.target.value = ""; }}><option value="">＋登録済み種目を追加</option>{allExercises.filter((exercise) => !historyDraft.exercises.some((item) => item.exerciseId === exercise.id)).map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select><button className="secondary compact" onClick={createHistoryExercise}>＋ 新しい種目を作成</button></div>
                        <label className="historyLocationEdit">実施場所<input type="text" value={historyDraft.location || ""} placeholder="PHGノース大阪" onChange={(event) => setHistoryDraft((draft) => ({ ...draft, location: event.target.value }))} /></label>
                        <label className="historyMemoEdit">Workoutメモ<textarea value={historyDraft.memo || ""} onChange={(event) => setHistoryDraft((draft) => ({ ...draft, memo: event.target.value }))} /></label>
                        <button className="secondary danger historyWorkoutDelete" onClick={deleteHistoryWorkout} disabled={savingHistory}>このWorkoutを削除</button><div className="historyEditActions"><button className="secondary" onClick={cancelHistoryEdit}>破棄</button><button className="primary" onClick={saveHistoryEdit} disabled={savingHistory}>{savingHistory ? "保存中…" : "変更を保存"}</button></div>
                      </div>}
                    </div>}
                  </article>;
                })}</div>}
                  </section>;
                })}
              </div>
            </section>
          )}

          {appView === "progress" && (
            <section className="analyticsPage">
              <div className="analyticsHead"><div><small>PROGRESS</small><h2>種目別の伸び</h2></div><button className="secondary compact" onClick={() => loadAnalytics(true)}>更新</button></div>
              <nav className="progressTabs" aria-label="進捗カテゴリー">
                {[{id:"exercise",label:"種目"},{id:"volume",label:"ボリューム"},{id:"coach",label:"Coach"},{id:"body",label:"Body"},{id:"photos",label:"写真"}].map((tab) => <button key={tab.id} className={progressTab === tab.id ? "active" : ""} onClick={() => setProgressTab(tab.id)}>{tab.label}</button>)}
              </nav>
              {analyticsBusy && <div className="loader">進捗を計算中…</div>}
              {!analyticsBusy && analytics && <div className="progressOverview card"><div><small>Workout</small><strong>{analytics.overview.workouts}</strong></div><div><small>完了セット</small><strong>{analytics.overview.sets}</strong></div><div><small>総ボリューム</small><strong>{formatVolume(analytics.overview.volume)}kg</strong></div></div>}
              {!analyticsBusy && analytics && <>
                {progressTab === "coach" && <section className={`card smartCoach partAccent ${partTone(nextCoachPart)}`}><small>SMART COACH・次回予定</small><h3>{nextCoachPart}</h3>{partCoachTips.length ? partCoachTips.map((tip) => <p key={tip}>{tip}</p>) : <p>{nextCoachPart}の記録がたまると、次回に絞った提案を表示するで。</p>}</section>}
                {progressTab === "volume" && <section className="card volumeUse"><small>MONTHLY VOLUME・{calendarMonth}</small><h3>部位別ボリューム目標</h3>{volumeByPart.map((item) => <div className={`volumeDetailRow partAccent ${partTone(item.part)}`} key={item.part}><div className="volumeDetailHead"><strong>{item.part}</strong><span>{item.workouts}回 / {item.sets}セット</span></div><div className="volumeTrack"><i style={{width: `${item.rate}%`}} /></div><div className="volumeDetailFoot"><span>{formatVolume(item.volume)}kg</span><label className="volumeGoalInput">目標 <input inputMode="decimal" value={item.target || ""} placeholder="未設定" onChange={(event) => updateMonthlyVolumeGoal(item.part, event.target.value)} /> kg</label><b>{item.target ? `${item.rate}%` : "—"}</b></div></div>)}</section>}
                {progressTab === "body" && <section className="card bodyTracking"><small>BODY TRACKING</small><h3>週次の身体記録</h3><div className="bodyGrid"><input type="date" value={bodyDraft.date} onChange={(e) => setBodyDraft((d) => ({...d, date:e.target.value}))}/><input placeholder="体重 kg" inputMode="decimal" value={bodyDraft.weight} onChange={(e) => setBodyDraft((d) => ({...d, weight:e.target.value}))}/><input placeholder="体脂肪 %" inputMode="decimal" value={bodyDraft.bodyFat} onChange={(e) => setBodyDraft((d) => ({...d, bodyFat:e.target.value}))}/><input placeholder="ウエスト cm" inputMode="decimal" value={bodyDraft.waist} onChange={(e) => setBodyDraft((d) => ({...d, waist:e.target.value}))}/><input placeholder="上腕 cm" inputMode="decimal" value={bodyDraft.arm} onChange={(e) => setBodyDraft((d) => ({...d, arm:e.target.value}))}/><input placeholder="写真URL（任意）" value={bodyDraft.photo} onChange={(e) => setBodyDraft((d) => ({...d, photo:e.target.value}))}/></div><button className="primary compact" onClick={saveBodyRecord}>保存</button><div className="bodyRecords">{bodyRecords.slice(0, 8).map((record) => <div key={record.id}><strong>{record.date}</strong><span>{record.weight && `${record.weight}kg`} {record.bodyFat && `/ ${record.bodyFat}%`} {record.waist && `/ 腹 ${record.waist}cm`} {record.arm && `/ 腕 ${record.arm}cm`}</span></div>)}</div></section>}
                {progressTab === "photos" && <section className="card photoTracking"><small>PHOTOS</small><h3>週ごとの比較写真</h3><p>Front・Side・Backを週ごとに残す画面。写真アップロード連携は次の実装で追加。</p></section>}
              </>}
              {progressTab === "exercise" && <div className="exerciseProgressList">
                {(analytics?.exercises || []).map((exercise) => {
                  const open = selectedExerciseId === exercise.id;
                  const points = exercise.sessions.slice(-8);
                  const max = Math.max(1, ...points.map((point) => point.e1rm));
                  return <article className="card progressCard" key={exercise.id}>
                    <button className="progressSummary" onClick={() => setSelectedExerciseId(open ? "" : exercise.id)}>
                      <div><small>{exercise.part}</small><strong>{exercise.name}</strong><span>{exercise.latest?.topSet || "記録なし"}</span></div>
                      <div className="progressNumbers"><span>最高 {exercise.maxWeight}kg</span><span>e1RM {exercise.bestE1rm.toFixed(1)}kg</span><b>{open ? "−" : "+"}</b></div>
                    </button>
                    {open && <div className="progressDetail">
                      <div className="miniChart" aria-label="推定1RM推移">{points.map((point) => <div className="chartColumn" key={point.date}><div className="chartBar" style={{height: `${Math.max(8, point.e1rm / max * 100)}%`}} title={`${point.date}: ${point.e1rm.toFixed(1)}kg`}></div><small>{point.date.slice(5)}</small></div>)}</div>
                      <div className="sessionTable">{[...exercise.sessions].reverse().slice(0, 8).map((session) => <div key={session.date}><span>{session.date}</span><strong>{session.topSet}</strong><em>e1RM {session.e1rm.toFixed(1)} / {formatVolume(session.volume)}kg</em></div>)}</div>
                    </div>}
                  </article>;
                })}
              </div>}
            </section>
          )}
          {appView === "menu" && <section className="menuPage"><button>テンプレート編集 <span>›</span></button><button onClick={() => { openView("history"); setEditingPlan(true); }}>週間予定の編集 <span>›</span></button><button>Bodyサイズの記録 <span>›</span></button><button>写真の管理 <span>›</span></button><button>設定 <span>›</span></button><small>D-log Ver.10.2.0</small></section>}
          <nav className="bottomNav" aria-label="メインナビゲーション">
            <button className={appView === "home" ? "active" : ""} onClick={() => openView("home")}><b>⌂</b><span>ホーム</span></button>
            <button className={appView === "history" ? "active" : ""} onClick={() => openView("history")}><b>▣</b><span>履歴</span></button>
            <button className={appView === "progress" ? "active" : ""} onClick={() => openView("progress")}><b>▥</b><span>進捗</span></button>
            <button className={appView === "menu" ? "active" : ""} onClick={() => openView("menu")}><b>☰</b><span>メニュー</span></button>
          </nav>
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
                <article className={`card exercise${exerciseLogs.length && exerciseLogs.every((item) => item.completed) ? " exerciseDone" : ""}`} key={exercise.id}>
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

      {preWorkoutOpen && (
        <div className="modalBackdrop"><section className="summaryModal card preWorkoutModal">
          <small>PRE-WORKOUT</small><h2>ストレッチ</h2><p>{part}のメニュー前に身体を整えるで。</p>
          <div className="stretchTimer"><strong>{formatTimer(stretchStatus === "running" && stretchStartedAt ? Math.floor((now - stretchStartedAt) / 1000) : stretchSeconds)}</strong><span>ストレッチ時間</span></div>
          {stretchStatus !== "running" ? <button className="primary" onClick={startStretch}>ストレッチ開始</button> : <button className="primary" onClick={finishStretchAndStart}>ストレッチ完了・トレ開始</button>}
          <button className="secondary" onClick={skipStretchAndStart}>Skipしてトレ開始</button>
          <div className="preWorkoutExercises">{exercises.map((exercise, index) => <span key={exercise.id}>{index + 1}. {exercise.name}</span>)}</div>
        </section></div>
      )}

      {absPromptOpen && (
        <div className="modalBackdrop"><section className="summaryModal card absPromptModal">
          <small>OPTIONAL FINISHER</small><h2>腹筋を追加する？</h2><p>キャプテンズチェア・レッグレイズ</p>
          <div className="absSets">{absSets.map((set, index) => <label key={index} className={set.completed ? "completed" : ""}><span>{index + 1}セット目</span><input inputMode="numeric" value={set.reps} onChange={(event) => setAbsSets((current) => current.map((item, i) => i === index ? {...item, reps: Number(event.target.value) || 0} : item))}/><em>回</em><input type="checkbox" checked={set.completed} onChange={(event) => setAbsSets((current) => current.map((item, i) => i === index ? {...item, completed: event.target.checked} : item))}/></label>)}</div>
          <button className="primary" onClick={() => finishAbsFlow("completed")}>腹筋を完了</button><button className="secondary" onClick={() => finishAbsFlow("skipped")}>Skip</button>
        </section></div>
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
              <div className="simpleFeedback">
                <div><span>今日はどうやった？</span><div className="feedbackChoices">{[{value:"キツかった",label:"😵 キツかった"},{value:"普通",label:"😐 普通"},{value:"良かった",label:"😊 良かった"},{value:"過去最高",label:"🔥 過去最高"}].map((item) => <button type="button" key={item.value} className={saveConfirm.assessment === item.value ? "active" : ""} onClick={() => setSaveConfirm((current) => ({...current, assessment:item.value}))}>{item.label}</button>)}</div></div>
                <div><span>パンプ（任意）</span><div className="feedbackChoices pumpChoices">{["なし","普通","良い","最高"].map((value) => <button type="button" key={value} className={saveConfirm.pump === value ? "active" : ""} onClick={() => setSaveConfirm((current) => ({...current, pump:value}))}>{value}</button>)}</div></div>
                <label className="workoutLocationField"><span>トレーニング場所</span><input type="text" value={saveConfirm.location || ""} placeholder="PHGノース大阪" onChange={(event) => setSaveConfirm((current) => ({...current, location:event.target.value}))}/><small>通常はPHGノース大阪。必要な日だけ変更。</small></label>
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
            <h2>{summary.part} 完了</h2>
            <div className="summaryGrid">
              <div><span>所要時間</span><strong>{formatElapsed(summary.durationSeconds)}</strong></div>
              <div><span>今日の評価</span><strong>{summary.assessment || "—"}</strong></div>
              <div><span>パンプ</span><strong>{summary.pump || "—"}</strong></div><div><span>場所</span><strong>{summary.location || "PHGノース大阪"}</strong></div><div><span>ストレッチ</span><strong>{summary.stretchStatus === "completed" ? formatTimer(summary.stretchSeconds) : "Skip"}</strong></div><div><span>腹筋</span><strong>{summary.absStatus === "completed" ? summary.absSets.map((set) => `${set.reps}回`).join(" / ") : "Skip"}</strong></div>
              <div><span>種目</span><strong>{summary.exercises}</strong></div>
              <div><span>総セット</span><strong>{summary.sets}</strong></div>
              <div><span>総レップ</span><strong>{summary.reps}</strong></div>
              <div className="wide"><span>PR更新</span><strong>{summary.prs}件</strong></div>
              <div className="wide summaryVolume"><span>総ボリューム</span><strong>{formatVolume(summary.volume)} kg</strong></div>
            </div>
            <button className="primary" onClick={() => { setSummary(null); newWorkout(); openView("history"); loadAnalytics(true); }}>記録を見る</button>
            <button className="secondary" onClick={() => { setSummary(null); newWorkout(); }}>ホームへ戻る</button>
          </section>
        </div>
      )}

      {busy && exercises.length === 0 && <div className="loader">読み込み中…</div>}

      {!workout && <footer className="appVersion">D-log Ver.10.2.0</footer>}

      {message && (
        <div className="toast" onClick={() => setMessage("")}>
          {message}
        </div>
      )}
    </main>
  );
}
