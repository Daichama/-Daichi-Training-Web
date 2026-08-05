import { NextResponse } from "next/server";
import { DB, plain, queryAll, selectName, createPage, updatePage, titleValue, richValue, selectValue, dateValue } from "../../lib/notion";

export const runtime = "nodejs";

const FALLBACK = {
  "2026-08-03": { menu: "背中", onCall: true },
  "2026-08-04": { menu: "休み", onCall: false },
  "2026-08-05": { menu: "肩", onCall: true },
  "2026-08-06": { menu: "休み", onCall: false },
  "2026-08-07": { menu: "腕", onCall: true },
  "2026-08-08": { menu: "脚", onCall: false },
  "2026-08-09": { menu: "胸", onCall: true },
};

function japanDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function mondayOfWeek(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(dateString, offset);
}

function firstDate(props) {
  for (const key of ["日付", "Date", "予定日", "トレ日"]) {
    const value = props?.[key]?.date?.start;
    if (value) return String(value).slice(0, 10);
  }
  return "";
}

function firstText(props, keys) {
  for (const key of keys) {
    const property = props?.[key];
    const value = plain(property) || selectName(property);
    if (value) return value;
  }
  return "";
}

function boolValue(props, keys) {
  for (const key of keys) {
    const property = props?.[key];
    if (typeof property?.checkbox === "boolean") return property.checkbox;
    const text = plain(property) || selectName(property);
    if (/当直|on.?call/i.test(text)) return true;
  }
  return false;
}

export async function GET(request) {
  const today = japanDate();
  const requestedMonth = new URL(request.url).searchParams.get("month");
  let dates = [];
  let weekdays = [];
  let offset = 0;
  if (/^\d{4}-\d{2}$/.test(requestedMonth || "")) {
    const [year, month] = requestedMonth.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    dates = Array.from({ length: lastDay }, (_, index) => `${requestedMonth}-${String(index + 1).padStart(2, "0")}`);
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    offset = firstWeekday === 0 ? 6 : firstWeekday - 1;
    weekdays = dates.map((date) => ["日","月","火","水","木","金","土"][new Date(`${date}T00:00:00Z`).getUTCDay()]);
  } else {
    const monday = mondayOfWeek(today);
    dates = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
    weekdays = ["月", "火", "水", "木", "金", "土", "日"];
  }

  let rows = [];
  if (DB.schedule) {
    try {
      const pages = await queryAll(DB.schedule);
      rows = pages.map((page) => {
        const props = page.properties || {};
        return { date: firstDate(props), menu: firstText(props, ["メニュー", "部位", "Workout", "予定", "名前", "Name"]), onCall: boolValue(props, ["当直", "On-call", "勤務", "メモ"]) };
      }).filter((row) => row.date);
    } catch { rows = []; }
  }
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const days = dates.map((date, index) => {
    const row = byDate.get(date) || FALLBACK[date] || {};
    return { date, weekday: weekdays[index], menu: row.menu || "", onCall: Boolean(row.onCall), today: date === today, ...(index === 0 ? { offset } : {}) };
  });
  return NextResponse.json({ days, source: rows.length ? "notion" : "fallback" });
}


export async function POST(request) {
  try {
    const body = await request.json();
    const days = Array.isArray(body?.days) ? body.days : [];
    if (!days.length) return NextResponse.json({ error: "予定がありません" }, { status: 400 });
    if (!DB.schedule) return NextResponse.json({ ok: true, synced: false, code: "LOCAL_ONLY" });

    const pages = await queryAll(DB.schedule);
    const existing = new Map(pages.map((page) => [firstDate(page.properties || {}), page]).filter(([date]) => date));
    let updated = 0;
    let created = 0;
    for (const item of days) {
      const date = String(item?.date || "").slice(0, 10);
      const menu = String(item?.menu || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const page = existing.get(date);
      const properties = {
        "日付": dateValue(date),
        "メニュー": selectValue(menu),
      };
      try {
        if (page) { await updatePage(page.id, properties); updated += 1; }
        else {
          await createPage(DB.schedule, { "名前": titleValue(`${date}｜${menu}`), ...properties });
          created += 1;
        }
      } catch {
        const fallbackProps = { "日付": dateValue(date), "予定": richValue(menu) };
        if (page) { await updatePage(page.id, fallbackProps); updated += 1; }
        else { await createPage(DB.schedule, { "名前": titleValue(`${date}｜${menu}`), ...fallbackProps }); created += 1; }
      }
    }
    return NextResponse.json({ ok: true, synced: true, updated, created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "予定保存に失敗しました" }, { status: 500 });
  }
}
