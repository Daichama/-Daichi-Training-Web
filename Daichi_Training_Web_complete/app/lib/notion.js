const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

export const DB = {
  master: process.env.NOTION_MASTER_DS,
  workout: process.env.NOTION_WORKOUT_DS,
  log: process.env.NOTION_LOG_DS,
  summary: process.env.NOTION_SUMMARY_DS,
  pr: process.env.NOTION_PR_DS,
  schedule: process.env.NOTION_SCHEDULE_DS,
};

function ensureEnv() {
  const missing = [
    ["NOTION_TOKEN", process.env.NOTION_TOKEN],
    ["NOTION_MASTER_DS", DB.master],
    ["NOTION_WORKOUT_DS", DB.workout],
    ["NOTION_LOG_DS", DB.log],
    ["NOTION_SUMMARY_DS", DB.summary],
    ["NOTION_PR_DS", DB.pr],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`Vercel環境変数が不足: ${missing.join(", ")}`);
  }
}

export async function notion(path, options = {}) {
  ensureEnv();

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(data?.message || `${response.status} ${response.statusText}`);
  }

  return data;
}

export async function queryAll(dataSourceId, body = {}) {
  const results = [];
  let cursor;

  do {
    const payload = { page_size: 100, ...body };
    if (cursor) payload.start_cursor = cursor;

    const data = await notion(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}

export function plain(property) {
  const values = property?.title || property?.rich_text || [];
  return values.map((item) => item.plain_text || "").join("");
}

export function selectName(property) {
  return property?.select?.name || "";
}

export function numberValue(property) {
  if (typeof property?.number === "number") return property.number;
  if (typeof property?.formula?.number === "number") return property.formula.number;
  if (typeof property?.rollup?.number === "number") return property.rollup.number;
  return 0;
}

export function relationIds(property) {
  return (property?.relation || []).map((item) => item.id);
}

export function titleValue(value) {
  return {
    title: value ? [{ type: "text", text: { content: String(value) } }] : [],
  };
}

export function richValue(value) {
  return {
    rich_text: value ? [{ type: "text", text: { content: String(value) } }] : [],
  };
}

export function selectValue(value) {
  return { select: value ? { name: String(value) } : null };
}

export function multiValue(values) {
  return {
    multi_select: (values || []).filter(Boolean).map((name) => ({ name })),
  };
}

export function numberProp(value) {
  return {
    number: Number.isFinite(Number(value)) ? Number(value) : null,
  };
}

export function dateValue(value) {
  return { date: value ? { start: value } : null };
}

export function relationValue(ids) {
  return {
    relation: (ids || []).filter(Boolean).map((id) => ({ id })),
  };
}

export function checkboxValue(value) {
  return { checkbox: Boolean(value) };
}

export async function createPage(dataSourceId, properties) {
  return notion("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
    }),
  });
}

export async function updatePage(pageId, properties) {
  return notion(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

export async function archivePage(pageId) {
  return notion(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  });
}
