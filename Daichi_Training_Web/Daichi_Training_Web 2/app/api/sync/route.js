import { NextResponse } from "next/server";
import {
  DB, createPage, dateValue, numberProp, numberValue, plain, queryAll,
  relationIds, relationValue, richValue, selectValue, titleValue, updatePage
} from "../../lib/notion";

export const runtime = "nodejs";

function dateProp(page, key) {
  return page.properties?.[key]?.date?.start || null;
}
function checked(page, key) {
  return Boolean(page.properties?.[key]?.checkbox);
}

export async function POST(request) {
  try {
    let workoutId = null;
    try { workoutId = (await request.json())?.workoutId || null; } catch {}
    const [allLogs, summaries, prs] = await Promise.all([
      queryAll(DB.log),
      queryAll(DB.summary),
      queryAll(DB.pr)
    ]);
    const logs = allLogs.filter(x => checked(x, "完了") && numberValue(x.properties?.["回数"]) > 0);
    const keys = new Set(prs.map(x => plain(x.properties?.["キー"])));
    const byExercise = new Map();

    for (const log of logs) {
      const ex = relationIds(log.properties?.["種目"])[0];
      const day = dateProp(log, "日付");
      if (!ex || !day) continue;
      if (!byExercise.has(ex)) byExercise.set(ex, []);
      byExercise.get(ex).push(log);
    }

    let updated = 0, created = 0;
    const now = new Date().toISOString();

    for (const summary of summaries) {
      const ex = relationIds(summary.properties?.["種目リンク"])[0];
      if (!ex) continue;
      const name = plain(summary.properties?.["種目"]);
      const items = byExercise.get(ex) || [];
      if (!items.length) continue;

      items.sort((a, b) => {
        const da = dateProp(a, "日付") || "";
        const db = dateProp(b, "日付") || "";
        return db.localeCompare(da) ||
          numberValue(b.properties?.["セット番号"]) - numberValue(a.properties?.["セット番号"]);
      });

      const latest = dateProp(items[0], "日付");
      const latestSets = items
        .filter(x => dateProp(x, "日付") === latest)
        .sort((a, b) => numberValue(a.properties?.["セット番号"]) - numberValue(b.properties?.["セット番号"]));

      const record = latestSets
        .map(x => `${numberValue(x.properties?.["重量kg"])}kg×${numberValue(x.properties?.["回数"])}`)
        .join(" / ");

      const bestWeight = items.reduce((a, b) =>
        numberValue(a.properties?.["重量kg"]) >= numberValue(b.properties?.["重量kg"]) ? a : b);
      const bestE1rm = items.reduce((a, b) =>
        numberValue(a.properties?.["推定1RM"]) >= numberValue(b.properties?.["推定1RM"]) ? a : b);
      const bestVolume = items.reduce((a, b) =>
        numberValue(a.properties?.["ボリューム"]) >= numberValue(b.properties?.["ボリューム"]) ? a : b);

      await updatePage(summary.id, {
        "前回記録": richValue(record),
        "前回日": dateValue(latest),
        "最高重量kg": numberProp(numberValue(bestWeight.properties?.["重量kg"])),
        "最高推定1RM": numberProp(numberValue(bestE1rm.properties?.["推定1RM"])),
        "最高セットVolume": numberProp(numberValue(bestVolume.properties?.["ボリューム"])),
        "同期日時": dateValue(now)
      });
      updated++;

      const candidates = [
        ["最高重量", bestWeight, numberValue(bestWeight.properties?.["重量kg"])],
        ["推定1RM", bestE1rm, numberValue(bestE1rm.properties?.["推定1RM"])],
        ["セットVolume", bestVolume, numberValue(bestVolume.properties?.["ボリューム"])]
      ];

      for (const [kind, item, value] of candidates) {
        const key = `${ex}|${kind}|${dateProp(item, "日付")}|${value.toFixed(4)}`;
        if (value <= 0 || keys.has(key)) continue;
        await createPage(DB.pr, {
          "PR": titleValue(`${name}｜${kind}`),
          "日付": dateValue(dateProp(item, "日付")),
          "種目": relationValue([ex]),
          "種類": selectValue(kind),
          "重量kg": numberProp(numberValue(item.properties?.["重量kg"])),
          "回数": numberProp(numberValue(item.properties?.["回数"])),
          "値": numberProp(value),
          "キー": richValue(key),
          "メモ": richValue("スマホWebアプリで自動登録")
        });
        keys.add(key);
        created++;
      }
    }

    if (workoutId) {
      await updatePage(workoutId, { "完了": { checkbox: true } });
    }

    return NextResponse.json({ ok: true, updated, created });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
