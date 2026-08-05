import { NextResponse } from "next/server";
import { checkboxValue, numberProp, updatePage } from "../../lib/notion";

export const runtime = "nodejs";

export async function PATCH(request) {
  try {
    const { pageId, weight, reps, rir, completed } = await request.json();

    if (!pageId) {
      return NextResponse.json({ error: "pageIdがありません" }, { status: 400 });
    }

    const normalizedWeight = Number(weight);
    const normalizedReps = Number(reps);
    const normalizedRir =
      rir === "" || rir === null || rir === undefined ? null : Number(rir);

    const volume =
      Number.isFinite(normalizedWeight) && Number.isFinite(normalizedReps)
        ? normalizedWeight * normalizedReps
        : 0;

    const e1rm =
      Number.isFinite(normalizedWeight) &&
      Number.isFinite(normalizedReps) &&
      normalizedReps > 0
        ? normalizedWeight * (1 + normalizedReps / 30)
        : 0;

    await updatePage(pageId, {
      重量kg: numberProp(normalizedWeight),
      回数: numberProp(normalizedReps),
      RIR: numberProp(normalizedRir),
      ボリューム: numberProp(volume),
      推定1RM: numberProp(e1rm),
      完了: checkboxValue(completed),
    });

    return NextResponse.json({ ok: true, volume, e1rm });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新に失敗しました" },
      { status: 500 }
    );
  }
}
