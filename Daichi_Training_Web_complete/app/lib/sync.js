import {
  DB,
  createPage,
  dateValue,
  numberProp,
  numberValue,
  plain,
  queryAll,
  relationIds,
  relationValue,
  richValue,
  selectValue,
  titleValue,
  updatePage,
} from "./notion";

function dateProp(page, key) {
  return page.properties?.[key]?.date?.start || null;
}

function checked(page, key) {
  return Boolean(page.properties?.[key]?.checkbox);
}

export async function syncTrainingData() {
  const [allLogs, summaries, prs] = await Promise.all([
    queryAll(DB.log),
    queryAll(DB.summary),
    queryAll(DB.pr),
  ]);

  const logs = allLogs.filter(
    (page) =>
      checked(page, "完了") && numberValue(page.properties?.["回数"]) > 0
  );

  const existingKeys = new Set(
    prs.map((page) => plain(page.properties?.["キー"])).filter(Boolean)
  );

  const byExercise = new Map();

  for (const log of logs) {
    const exerciseId = relationIds(log.properties?.["種目"])[0];
    const day = dateProp(log, "日付");

    if (!exerciseId || !day) continue;
    if (!byExercise.has(exerciseId)) byExercise.set(exerciseId, []);
    byExercise.get(exerciseId).push(log);
  }

  let updated = 0;
  let created = 0;
  const now = new Date().toISOString();

  for (const summary of summaries) {
    const exerciseId = relationIds(summary.properties?.["種目リンク"])[0];
    if (!exerciseId) continue;

    const exerciseName = plain(summary.properties?.["種目"]);
    const items = byExercise.get(exerciseId) || [];
    if (!items.length) continue;

    items.sort((a, b) => {
      const aDate = dateProp(a, "日付") || "";
      const bDate = dateProp(b, "日付") || "";
      return (
        bDate.localeCompare(aDate) ||
        numberValue(b.properties?.["セット番号"]) -
          numberValue(a.properties?.["セット番号"])
      );
    });

    const latestDate = dateProp(items[0], "日付");
    const latestSets = items
      .filter((item) => dateProp(item, "日付") === latestDate)
      .sort(
        (a, b) =>
          numberValue(a.properties?.["セット番号"]) -
          numberValue(b.properties?.["セット番号"])
      );

    const latestRecord = latestSets
      .map(
        (item) =>
          `${numberValue(item.properties?.["重量kg"])}kg×${numberValue(
            item.properties?.["回数"]
          )}`
      )
      .join(" / ");

    const bestWeight = items.reduce((best, item) =>
      numberValue(item.properties?.["重量kg"]) >=
      numberValue(best.properties?.["重量kg"])
        ? item
        : best
    );

    const bestE1rm = items.reduce((best, item) =>
      numberValue(item.properties?.["推定1RM"]) >=
      numberValue(best.properties?.["推定1RM"])
        ? item
        : best
    );

    const bestVolume = items.reduce((best, item) =>
      numberValue(item.properties?.["ボリューム"]) >=
      numberValue(best.properties?.["ボリューム"])
        ? item
        : best
    );

    await updatePage(summary.id, {
      前回記録: richValue(latestRecord),
      前回日: dateValue(latestDate),
      最高重量kg: numberProp(numberValue(bestWeight.properties?.["重量kg"])),
      最高推定1RM: numberProp(numberValue(bestE1rm.properties?.["推定1RM"])),
      最高セットVolume: numberProp(
        numberValue(bestVolume.properties?.["ボリューム"])
      ),
      同期日時: dateValue(now),
    });

    updated += 1;

    const candidates = [
      ["最高重量", bestWeight, numberValue(bestWeight.properties?.["重量kg"])],
      ["推定1RM", bestE1rm, numberValue(bestE1rm.properties?.["推定1RM"])],
      [
        "セットVolume",
        bestVolume,
        numberValue(bestVolume.properties?.["ボリューム"]),
      ],
    ];

    for (const [kind, item, value] of candidates) {
      const itemDate = dateProp(item, "日付");
      const key = `${exerciseId}|${kind}|${itemDate}|${value.toFixed(4)}`;

      if (value <= 0 || existingKeys.has(key)) continue;

      await createPage(DB.pr, {
        PR: titleValue(`${exerciseName}｜${kind}`),
        日付: dateValue(itemDate),
        種目: relationValue([exerciseId]),
        種類: selectValue(kind),
        重量kg: numberProp(numberValue(item.properties?.["重量kg"])),
        回数: numberProp(numberValue(item.properties?.["回数"])),
        値: numberProp(value),
        キー: richValue(key),
        メモ: richValue("スマホWebアプリで自動登録"),
      });

      existingKeys.add(key);
      created += 1;
    }
  }

  return { updated, created };
}
