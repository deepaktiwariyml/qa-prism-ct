/**
 * Best-effort extraction of a JSON value from a model response — strips code
 * fences and any prose around the first balanced object/array. The model is
 * asked to return only JSON, but this makes parsing resilient if it doesn't.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1]! : trimmed).trim();

  const firstObj = body.indexOf('{');
  const firstArr = body.indexOf('[');
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (starts.length === 0) return body;
  const start = Math.min(...starts);
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  const end = body.lastIndexOf(close);
  return end > start ? body.slice(start, end + 1) : body;
}
