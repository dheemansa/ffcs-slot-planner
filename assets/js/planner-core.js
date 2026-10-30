/* ---------- Slot chart (edit here if your campus chart differs) ---------- */
        const DAYS = ["TUE", "WED", "THU", "FRI", "SAT"];
        const DAYNAME = {
          TUE: "Tue",
          WED: "Wed",
          THU: "Thu",
          FRI: "Fri",
          SAT: "Sat",
        };
        const TH_TIMES = [
          ["08:00", "08:50"],
          ["09:00", "09:50"],
          ["10:00", "10:50"],
          ["11:00", "11:50"],
          ["12:00", "12:50"],
          ["14:00", "14:50"],
          ["15:00", "15:50"],
          ["16:00", "16:50"],
          ["17:00", "17:50"],
          ["18:00", "18:50"],
        ];
        const LAB_TIMES = [
          ["08:00", "08:50"],
          ["08:51", "09:40"],
          ["09:51", "10:40"],
          ["10:41", "11:30"],
          ["11:40", "12:30"],
          ["12:31", "13:20"],
          ["14:00", "14:50"],
          ["14:51", "15:40"],
          ["15:51", "16:40"],
          ["16:41", "17:30"],
          ["17:40", "18:30"],
          ["18:31", "19:20"],
        ];
        const THEORY = {
          TUE: ["A1", "F1", "D1", "TB1", "TG1", "A2", "F2", "D2", "TB2", "TG2"],
          WED: [
            "B1",
            "G1",
            "E1",
            "TC1",
            "TAA1",
            "B2",
            "G2",
            "E2",
            "TC2",
            "TAA2",
          ],
          THU: ["C1", "A1", "F1", "V1", "V2", "C2", "A2", "F2", "TD2", "TBB2"],
          FRI: [
            "D1",
            "B1",
            "G1",
            "TE1",
            "TCC1",
            "D2",
            "B2",
            "G2",
            "TE2",
            "TCC2",
          ],
          SAT: [
            "E1",
            "C1",
            "TA1",
            "TF1",
            "TD1",
            "E2",
            "C2",
            "TA2",
            "TF2",
            "TDD2",
          ],
        };
        const LAB_START = {
          TUE: [1, 31],
          WED: [7, 37],
          THU: [13, 43],
          FRI: [19, 49],
          SAT: [25, 55],
        };

        const mins = (t) => {
          const p = t.split(":").map(Number);
          return p[0] * 60 + p[1];
        };
        const fmt = (m) =>
          String(Math.floor(m / 60)).padStart(2, "0") +
          ":" +
          String(m % 60).padStart(2, "0");
        const LABS = {};
        DAYS.forEach((d) => {
          const a = LAB_START[d][0],
            b = LAB_START[d][1],
            r = [];
          for (let i = 0; i < 6; i++) r.push("L" + (a + i));
          for (let i = 0; i < 6; i++) r.push("L" + (b + i));
          LABS[d] = r;
        });
        const SLOT_INDEX = {};
        function addSlot(id, c) {
          (SLOT_INDEX[id] = SLOT_INDEX[id] || []).push(c);
        }
        DAYS.forEach((d) => {
          THEORY[d].forEach((id, i) =>
            addSlot(id, {
              day: d,
              kind: "theory",
              idx: i,
              start: mins(TH_TIMES[i][0]),
              end: mins(TH_TIMES[i][1]),
            }),
          );
          LABS[d].forEach((id, i) =>
            addSlot(id, {
              day: d,
              kind: "lab",
              idx: i,
              start: mins(LAB_TIMES[i][0]),
              end: mins(LAB_TIMES[i][1]),
            }),
          );
        });

        /* ---------- Slot strings ---------- */
        const TOK = "(?:[A-G][12]|T[A-G]{1,2}[12]|V[1-7]|L\\d{1,2})";
        const TOK_FULL = new RegExp("^" + TOK + "$");
        const GROUP_SRC =
          "(?<![A-Za-z0-9])" + TOK + "(?:\\+" + TOK + ")*(?![A-Za-z0-9])";
        const isLabSlot = (s) => /^L\d+$/.test(s);

        function parseSlotString(s) {
          const seen = new Set(),
            out = [];
          String(s || "")
            .toUpperCase()
            .split(/[^A-Z0-9]+/)
            .forEach((t) => {
              if (TOK_FULL.test(t) && !seen.has(t)) {
                seen.add(t);
                out.push(t);
              }
            });
          return out;
        }
        function kindOf(slots) {
          const lab = slots.some(isLabSlot),
            th = slots.some((s) => !isLabSlot(s));
          return lab && !th ? "lab" : "theory";
        }
        const groupOf = (opt) => (opt.kind === "lab" ? "lab" : "theory");

        /* ---------- Clash maths ---------- */
        function intervals(opt) {
          const r = [];
          opt.slots.forEach((s) =>
            (SLOT_INDEX[s] || []).forEach((c) =>
              r.push({
                day: c.day,
                kind: c.kind,
                slot: s,
                start: c.start,
                end: c.end,
              }),
            ),
          );
          return r;
        }
        function overlap(a, b) {
          const A = intervals(a),
            B = intervals(b),
            hits = [];
          A.forEach((x) =>
            B.forEach((y) => {
              if (x.day === y.day && x.start < y.end && y.start < x.end)
                hits.push([x, y]);
            }),
          );
          return hits;
        }

        /* ---------- PDF text -> rows ---------- */
        function groupLines(items) {
          const its = items
            .filter((i) => i.str && i.str.trim())
            .map((i) => ({
              s: i.str.trim(),
              x: i.transform[4],
              y: i.transform[5],
              w: i.width || 0,
            }));
          its.sort((a, b) => b.y - a.y || a.x - b.x);
          const lines = [];
          let cur = null;
          its.forEach((it) => {
            if (!cur || Math.abs(cur.y - it.y) > 3) {
              cur = { y: it.y, items: [] };
              lines.push(cur);
            }
            cur.items.push(it);
          });
          return lines.map((l) => {
            l.items.sort((a, b) => a.x - b.x);
            let s = "",
              end = null;
            l.items.forEach((it) => {
              if (end !== null) {
                const gap = it.x - end;
                s += gap > 4 ? "\t" : gap > 0.8 ? " " : "";
              }
              s += it.s;
              end = it.x + it.w;
            });
            return s;
          });
        }

        const CODE_RE = /\b[A-Z]{3,4}\d{4}[A-Z]?\b/;
        const VENUE_RE = /^[A-Z]{2,5}[- ]?[A-Z]{0,3}\d{1,4}[A-Z]?$/;
        const VENUE_IN = /\b[A-Z]{2,5}-[A-Z]{0,3}\d{1,4}[A-Z]?\b/;
        const TYPE_RE =
          /^(ETH|ELA|EPJ|ETL|ELO|TH|LO|LAB|THEORY|SS|PJT|EMB|NIL|NA|N\/A|ETH\/ELA)$/i;
        const HEAD_RE =
          /^(slot|slots|venue|room|faculty|course|title|type|code|class|nbr|name|credits?|sl\.?\s*no\.?)\W*$/i;
        const TITLE_CELL = /^(?:Dr|DR|Prof|PROF|Mr|MR|Mrs|MRS|Ms|MS)\b\.?\s*\S/;
        const TITLED_RE =
          /\b(?:Dr|DR|Prof|PROF|Mr|MR|Mrs|MRS|Ms|MS)\.?\s+[A-Z][A-Za-z.']*(?:\s+[A-Z][A-Za-z.']*){0,3}/;
        const NAME_CELL = /^[A-Za-z][A-Za-z.' ]{2,45}$/;
        const TAIL_CAPS = /((?:[A-Z][A-Z.']*\s+){1,3}[A-Z][A-Z.']*)\s*$/;
        const TAIL_NAME = /([A-Z][a-z.']+\s+[A-Z][a-z.']+)\s*$/;

        function normText(s) {
          return String(s)
            .replace(/(L\d{1,2})\s*[-–]\s*(L\d{1,2})/g, "$1+$2")
            .replace(/\s*\+\s*/g, "+");
        }
        function tidyName(n) {
          n = n
            .replace(/[\s,;:|]+$/g, "")
            .replace(/\s{2,}/g, " ")
            .trim();
          if (n && n === n.toUpperCase())
            n = n
              .toLowerCase()
              .replace(/(^|[\s.'])([a-z])/g, (m, a, b) => a + b.toUpperCase());
          return n;
        }
        function parseRows(lines, codeHint) {
          const out = [],
            seen = new Set(),
            codes = {};
          lines.forEach((raw) => {
            if (!raw || raw.length < 3) return;
            const norm = normText(raw);
            const codeM = norm.match(CODE_RE);
            if (codeHint && codeM && codeM[0] !== codeHint) return;
            const cells = norm
              .split(/\t+| {2,}/)
              .map((c) => c.trim())
              .filter(Boolean);
            const slots = [],
              rest = [];
            cells.forEach((c) => {
              const r = c
                .replace(new RegExp(GROUP_SRC, "g"), (m) => {
                  m.split("+").forEach((t) => slots.push(t));
                  return " ";
                })
                .replace(/[\s,;/|()]+/g, " ")
                .trim();
              if (r && !HEAD_RE.test(r)) rest.push(r);
            });
            if (!slots.length) return;
            const code = codeM ? codeM[0] : null;
            if (code) codes[code] = (codes[code] || 0) + 1;
            const rest2 = rest
              .map((c) => (code ? c.replace(code, "").trim() : c))
              .filter((c) => c && !/^[\d\s.\-]+$/.test(c) && !TYPE_RE.test(c));
            const joined = rest2.join("  ");
            let venue =
              rest2.find((c) => VENUE_RE.test(c)) ||
              (joined.match(VENUE_IN) || [""])[0];
            let fac = rest2.find((c) => TITLE_CELL.test(c));
            if (!fac) {
              const tm = joined.match(TITLED_RE);
              if (tm) fac = tm[0];
            }
            if (!fac) {
              const cand = rest2.filter(
                (c) =>
                  NAME_CELL.test(c) && !VENUE_RE.test(c) && !HEAD_RE.test(c),
              );
              if (cells.length > 1 && cand.length) fac = cand[cand.length - 1];
              else {
                const j = joined
                  .replace(VENUE_IN, " ")
                  .replace(/\s+/g, " ")
                  .trim();
                const tn = j.match(TAIL_CAPS) || j.match(TAIL_NAME);
                if (tn) fac = tn[1];
              }
            }
            const u = Array.from(new Set(slots));
            const faculty = fac ? tidyName(fac) : "Unknown faculty";
            const key = faculty + "|" + u.join("+");
            if (seen.has(key)) return;
            seen.add(key);
            out.push({
              faculty: faculty,
              slots: u,
              venue: venue || "",
              kind: kindOf(u),
              guess: !fac,
            });
          });
          let top = null,
            n = 0;
          Object.keys(codes).forEach((c) => {
            if (codes[c] > n) {
              n = codes[c];
              top = c;
            }
          });
          return { options: out, code: top };
        }

export { DAYS, DAYNAME, TH_TIMES, LAB_TIMES, THEORY, LABS, SLOT_INDEX, mins, fmt, isLabSlot, parseSlotString, kindOf, groupOf, intervals, overlap, groupLines, parseRows, CODE_RE };
