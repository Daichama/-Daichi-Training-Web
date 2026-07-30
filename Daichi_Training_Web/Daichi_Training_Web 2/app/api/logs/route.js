import { NextResponse } from "next/server";
import { checkboxValue, numberProp, updatePage } from "../../lib/notion";

export const runtime = "nodejs";

export async function PATCH(request) {
  try {
    const { pageId, weight, reps, rir, completed } = await request.json();
    if (!pageId) return NextResponse.json({ error: "pageIdがありません" }, { status: 400 });

    const w = Number(weight);
    const r = Number(reps);
    const rirNumber = rir === "" || rir === null || rir === undefined ? null : Number(rir);
    const volume = Number.isFinite(w) && Number.isFinite(r) ? w * r : 0;
    const e1rm = Number.isFinite(w) && Number.isFinite(r) && r > 0 ? w * (1 + r / 30) : 0;

    await updatePage(pageId, {
      "重量kg": numberProp(w),
      "回数": numberProp(r),
      "RIR": numberProp(rirNumber),
      "ボリューム": numberProp(volume),
      "推定1RM": numberProp(e1rm),
      "完了": checkboxValue(completed)
    });

    return NextResponse.json({ ok: true, volume, e1rm });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
