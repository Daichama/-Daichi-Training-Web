import { NextResponse } from "next/server";
import { DB, plain, queryAll, selectName } from "../../lib/notion";

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

function startOfWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00+09:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function isoDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

export async function GET() {
  const today = japanDate();
  const monday = startOfWeek(today);
  const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return isoDate(date);
  });

  let rows = [];
  if (DB.schedule) {
    try {
      const pages = await queryAll(DB.schedule);
      rows = pages.map((page) => {
        const props = page.properties || {};
        return {
          date: firstDate(props),
          menu: firstText(props, ["メニュー", "部位", "Workout", "予定", "名前", "Name"]),
          onCall: boolValue(props, ["当直", "On-call", "勤務", "メモ"]),
        };
      }).filter((row) => row.date);
    } catch {
      rows = [];
    }
  }

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const days = dates.map((date, index) => {
    const row = byDate.get(date) || FALLBACK[date] || {};
    return {
      date,
      weekday: weekdays[index],
      menu: row.menu || "休み",
      onCall: Boolean(row.onCall),
      today: date === today,
    };
  });

  return NextResponse.json({ days, source: rows.length ? "notion" : "fallback" });
}
