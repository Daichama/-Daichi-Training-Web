import { NextResponse } from "next/server";
import { DB, numberValue, queryAll } from "../../lib/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthKeyInJapan() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function dateStart(property) {
  return property?.date?.start || "";
}

export async function GET() {
  try {
    const monthKey = monthKeyInJapan();

    const [workoutPages, logPages] = await Promise.all([
      queryAll(DB.workout),
      queryAll(DB.log),
    ]);

    const workoutsThisMonth = workoutPages.filter((page) =>
      dateStart(page.properties?.日付).startsWith(monthKey)
    );

    const logsThisMonth = logPages.filter((page) =>
      dateStart(page.properties?.日付).startsWith(monthKey)
    );

    const minutes = workoutsThisMonth.reduce(
      (total, page) => total + numberValue(page.properties?.所要時間min),
      0
    );

    const volume = logsThisMonth.reduce((total, page) => {
      const savedVolume = numberValue(page.properties?.ボリューム);
      if (savedVolume > 0) return total + savedVolume;

      const weight = numberValue(page.properties?.重量kg);
      const reps = numberValue(page.properties?.回数);
      return total + weight * reps;
    }, 0);

    return NextResponse.json({
      month: monthKey,
      workouts: workoutsThisMonth.length,
      minutes: Math.round(minutes),
      volume,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Notionから集計を取得できませんでした",
      },
      { status: 500 }
    );
  }
}
