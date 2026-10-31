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
          ["09:00", "09:50"],
          ["09:50", "10:40"],
          ["11:00", "11:50"],
          ["11:50", "12:40"],
          ["12:40", "13:30"],
          ["14:00", "14:50"],
          ["14:50", "15:40"],
          ["16:00", "16:50"],
          ["16:50", "17:40"],
          ["18:00", "18:50"],
          ["18:50", "19:30"],
        ];
        const THEORY = {
          TUE: [
            "TFF1",
            "A1",
            "B1",
            ["TC1", "G1"],
            "D1",
            "F2",
            "A2",
            "B2",
            ["TC2", "G2"],
            "TDD2",
          ],
          WED: [
            "TGG1",
            "D1",
            "F1",
            ["E1", "SC2"],
            "B1",
            "D2",
            ["TF2", "G2"],
            ["E2", "SC1"],
            "B2",
            "TCC2",
          ],
          THU: [
            "TEE1",
            "C1",
            ["TD1", "TG1"],
            ["TAA1", "ECS"],
            ["TBB1", "CLUB"],
            ["TE2", "SE1"],
            "C2",
            ["TD2", "TG2"],
            "A2",
            "TFF2",
          ],
          FRI: [
            "TCC1",
            "TB1",
            "TA1",
            "F1",
            ["TE1", "SD2"],
            "C2",
            "TB2",
            "TA2",
            "F2",
            "TEE2",
          ],
          SAT: [
            "TDD1",
            ["E1", "SC2"],
            "C1",
            ["TF1", "G1"],
            "A1",
            "D2",
            ["E2", "SD1"],
            ["TAA2", "ECS"],
            ["TBB2", "CLUB"],
            "TGG2",
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
        const slotIds = (slot) => (Array.isArray(slot) ? slot : [slot]);
        DAYS.forEach((d) => {
          THEORY[d].forEach((id, i) => {
            const cell = {
              day: d,
              kind: "theory",
              idx: i,
              start: mins(TH_TIMES[i][0]),
              end: mins(TH_TIMES[i][1]),
            };
            slotIds(id).forEach((slot) => addSlot(slot, cell));
          });
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
        const TOK =
          "(?:[A-G][12]|T[A-G]{1,2}[12]|S[A-E][12]|ECS|CLUB|V[1-7]|L\\d{1,2})";
        const TOK_FULL = new RegExp("^" + TOK + "$");
        const CODE_RE = /\b[A-Z]{3,4}\d{4}[A-Z]?\b/;
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

export { DAYS, DAYNAME, TH_TIMES, LAB_TIMES, THEORY, LABS, SLOT_INDEX, mins, fmt, isLabSlot, parseSlotString, slotIds, kindOf, groupOf, intervals, overlap, CODE_RE };
