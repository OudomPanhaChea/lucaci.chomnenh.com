// Human quantities in the units things were SOLD in. Displays never convert
// to base units: 1000 boxes shows as "1000 Box of 12", not 12,000 pcs.

// parts: [{ unit_name, qty }], loose rows have unit_name = NULL and use the
// product's base unit word. Output: "1000 Box of 12 + 5 tubes".
export const composeQtyDesc = (parts, baseUnit) =>
  parts
    .map((p) => `${p.qty} ${p.unit_name || baseUnit || "pcs"}`)
    .join(" + ")
    .slice(0, 190);

// Merge per-unit SQL rows (grouped by ...keys + unit_name) into one line per
// `keyOf(row)` with summed qty/line_total and a composed qty_desc. `sum`
// lists extra numeric fields to accumulate (e.g. "pieces").
export function mergeUnitRows(rows, keyOf, sum = []) {
  const map = new Map();
  for (const r of rows) {
    const key = keyOf(r);
    let line = map.get(key);
    if (!line) {
      const { unit_name: _u, qty: _q, ...rest } = r;
      line = { ...rest, qty: 0, parts: [] };
      for (const f of sum) line[f] = 0;
      map.set(key, line);
    }
    line.qty += Number(r.qty);
    for (const f of sum) line[f] += Number(r[f]);
    line.parts.push({ unit_name: r.unit_name, qty: Number(r.qty) });
  }
  return [...map.values()].map(({ parts, ...line }) => ({
    ...line,
    qty_desc: composeQtyDesc(parts, line.base_unit),
  }));
}
