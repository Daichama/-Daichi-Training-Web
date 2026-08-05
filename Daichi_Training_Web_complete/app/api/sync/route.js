import { NextResponse } from "next/server";
import { syncTrainingData } from "../../lib/sync";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await syncTrainingData();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同期に失敗しました" },
      { status: 500 }
    );
  }
}
