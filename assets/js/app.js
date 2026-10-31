import {
    DAYNAME,
    SLOT_INDEX,
    CODE_RE,
    fmt,
    groupOf,
    isLabSlot,
    kindOf,
    overlap,
    parseSlotString,
} from './core.js';
import { createBoardRenderer } from './board.js';
import {
    COLORS,
    STORAGE_KEY,
    cached,
    facultySlotKey,
    loadPreset,
    optionCacheKey,
    save,
    state,
    subjectCacheKey,
    uid,
} from './state.js';

function resetSelections() {
    state.subjects.forEach((subject) => {
        subject.sel = { theory: null, lab: null };
    });
    ui.preview = null;
    render();
    toast('Timetable selections reset.');
}
const ui = {
    manage: false,
    filter: '',
    editing: null,
    renaming: false,
    preview: null,
    foldManual: false,
    confirmDel: null,
    presetError: '',
};

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) =>
    String(s == null ? '' : s).replace(
        /[&<>"']/g,
        (c) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[c]
    );
const active = () => state.subjects.find((s) => s.id === state.activeId) || null;
function label(s) {
    if (s.code) return s.code;
    const w = s.name.split(/\s+/).filter(Boolean);
    if (w.length > 1)
        return (
            w
                .filter((x) => x.length > 2 || w.length < 3)
                .map((x) => x[0])
                .join('')
                .toUpperCase()
                .slice(0, 4) || s.name.slice(0, 5)
        );
    return s.name.slice(0, 6).toUpperCase();
}
function shortName(f) {
    const p = f
        .replace(/\b(Dr|Prof|Mr|Mrs|Ms)\b\.?/gi, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!p.length) return f;
    if (p.length === 1) return p[0];
    return (
        p
            .slice(0, -1)
            .map((x) => x[0].toUpperCase() + '.')
            .join('') +
        ' ' +
        p[p.length - 1]
    );
}
function selectedItems() {
    const r = [];
    state.subjects.forEach((s) =>
        ['theory', 'lab'].forEach((g) => {
            const o = s.options.find((x) => x.id === s.sel[g]);
            if (o) r.push({ subject: s, group: g, opt: o });
        })
    );
    return r;
}
function analyse(skip) {
    const items = selectedItems().filter((it) => !(skip && skip(it))),
        keys = new Set(),
        msgs = [],
        pairs = new Set();
    for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) {
            const hits = overlap(items[i].opt, items[j].opt);
            hits.forEach((h) => {
                const x = h[0],
                    y = h[1];
                keys.add(items[i].opt.id + '|' + x.day + '|' + x.slot);
                keys.add(items[j].opt.id + '|' + y.day + '|' + y.slot);
                pairs.add(i + '-' + j);
                const m =
                    label(items[i].subject) +
                    ' ' +
                    x.slot +
                    ' overlaps ' +
                    label(items[j].subject) +
                    ' ' +
                    y.slot +
                    ' on ' +
                    DAYNAME[x.day] +
                    ' ' +
                    fmt(Math.max(x.start, y.start));
                if (msgs.indexOf(m) < 0) msgs.push(m);
            });
        }
    return { items: items, keys: keys, msgs: msgs, count: pairs.size };
}
function conflictFor(subject, group, opt, items) {
    for (let k = 0; k < items.length; k++) {
        const it = items[k];
        if (it.subject.id === subject.id && it.group === group) continue;
        if (it.opt.id === opt.id) continue;
        const h = overlap(opt, it.opt);
        if (h.length)
            return (
                label(it.subject) +
                ' ' +
                h[0][1].slot +
                ' on ' +
                DAYNAME[h[0][0].day] +
                ' ' +
                fmt(Math.max(h[0][0].start, h[0][1].start))
            );
    }
    return null;
}

/* ---------- rendering ---------- */
function icon(n, size) {
    return (
        '<span class="ms"' +
        (size ? ' style="font-size:' + size + 'px"' : '') +
        ' aria-hidden="true">' +
        n +
        '</span>'
    );
}
function chips(opt) {
    return opt.slots
        .map(
            (s) =>
                '<span class="sl ' +
                (isLabSlot(s) ? 'lab' : '') +
                (SLOT_INDEX[s] ? '' : ' un') +
                '"' +
                (SLOT_INDEX[s] ? '' : ' title="Not in the slot chart, so it is not drawn"') +
                '>' +
                esc(s) +
                '</span>'
        )
        .join('');
}
function summaryOf(s) {
    const t = s.options.find((o) => o.id === s.sel.theory),
        l = s.options.find((o) => o.id === s.sel.lab);
    const p = [];
    if (t) p.push(t.slots.join('+') + ' ' + shortName(t.faculty));
    if (l) p.push(l.slots.join('+') + ' ' + shortName(l.faculty));
    return p.join(' · ');
}

function renderDrawer(an) {
    const el = $('#dList');
    if (!state.subjects.length) {
        el.innerHTML = '<div class="d-empty">No subjects yet. Add the first one below.</div>';
        return;
    }
    el.innerHTML =
        '<ul class="d-list">' +
        state.subjects
            .map((s) => {
                const sm = summaryOf(s);
                const bad =
                    an.items.some((it) => it.subject.id === s.id) &&
                    an.items.some(
                        (it) =>
                            it.subject.id === s.id &&
                            an.keys.size &&
                            Array.from(an.keys).some((k) => k.indexOf(it.opt.id + '|') === 0)
                    );
                const confirm = ui.confirmDel === s.id;
                return (
                    '<li class="d-item ' +
                    (s.id === state.activeId ? 'active' : '') +
                    '">' +
                    '<button class="d-main" data-act="pick" data-id="' +
                    s.id +
                    '"><span class="dot" style="--sc:' +
                    s.color +
                    '"></span><span class="d-t"><b>' +
                    esc(s.name) +
                    '</b><span class="' +
                    (bad ? 'bad' : '') +
                    '">' +
                    (bad ? 'Clash · ' : '') +
                    esc((s.code ? s.code + ' · ' : '') + (sm || 'No option picked yet')) +
                    '</span></span></button>' +
                    (confirm
                        ? '<button class="btn sm" data-act="del-sub" data-id="' +
                          s.id +
                          '" style="color:var(--bad);border-color:var(--bad-line)">Delete?</button>'
                        : '<button class="icon-btn" data-act="del-sub" data-id="' +
                          s.id +
                          '" aria-label="Delete ' +
                          esc(s.name) +
                          '">' +
                          icon('delete', 18) +
                          '</button>') +
                    '</li>'
                );
            })
            .join('') +
        '</ul>';
}

function optionHtml(s, g, o, items) {
    const sel = s.sel[g] === o.id;
    if (ui.editing === o.id) {
        return (
            '<div class="opt" style="cursor:default"><div class="o-body"><form class="edit" data-form="edit-opt" data-id="' +
            o.id +
            '">' +
            '<label class="lbl" for="e-fac">Faculty<input class="field" id="e-fac" name="faculty" value="' +
            esc(o.faculty) +
            '"></label>' +
            '<div class="row"><label class="lbl" for="e-slots">Slots<input class="field" id="e-slots" name="slots" value="' +
            esc(o.slots.join('+')) +
            '"></label>' +
            '<label class="lbl" for="e-venue">Venue<input class="field" id="e-venue" name="venue" value="' +
            esc(o.venue) +
            '"></label></div>' +
            '<div class="acts"><button class="btn primary sm" type="submit">Save</button><button class="btn sm" type="button" data-act="cancel-edit">Cancel</button></div></form></div></div>'
        );
    }
    const bad = sel ? null : conflictFor(s, g, o, items);
    const starred = state.starredOptions.includes(facultySlotKey(o));
    const facultyLabel = Array.from(o.faculty);
    const displayFaculty =
        facultyLabel.length > 17 ? facultyLabel.slice(0, 17).join('') + '…' : o.faculty;
    const tip =
        o.faculty +
        ' \u00b7 ' +
        o.slots.join('+') +
        (o.venue ? ' \u00b7 ' + o.venue : '') +
        (bad ? ' \u00b7 Clashes with ' + bad : '');
    return (
        '<div class="opt ' +
        (sel ? 'sel' : '') +
        (bad ? ' bad' : '') +
        '" role="radio" aria-checked="' +
        sel +
        '" tabindex="0" data-act="sel" data-id="' +
        o.id +
        '" data-g="' +
        g +
        '" title="' +
        esc(tip) +
        '">' +
        '<span class="radio"></span><span class="fac">' +
        esc(displayFaculty) +
        '</span>' +
        '<button class="icon-btn star-btn' +
        (starred ? ' on' : '') +
        '" data-act="star-option" data-id="' +
        o.id +
        '" aria-label="' +
        (starred ? 'Unstar ' : 'Star ') +
        esc(o.faculty + ' · ' + o.slots.join('+')) +
        '" aria-pressed="' +
        starred +
        '" title="' +
        (starred ? 'Unstar this option' : 'Star this option') +
        '">' +
        '<span class="star-glyph" aria-hidden="true"></span>' +
        '</button>' +
        '<span class="slots">' +
        chips(o) +
        '</span>' +
        (ui.manage
            ? '<span class="o-act"><button class="icon-btn" data-act="edit" data-id="' +
              o.id +
              '" aria-label="Edit option">' +
              icon('edit') +
              '</button>' +
              '<button class="icon-btn" data-act="del-opt" data-id="' +
              o.id +
              '" aria-label="Delete option">' +
              icon('delete') +
              '</button></span>'
            : '') +
        '</div>'
    );
}

function renderOptions() {
    const s = active(),
        el = $('#optlist');
    if (!s || !el) return;
    const items = selectedItems(),
        q = ui.filter.trim().toLowerCase();
    const groups = [
        ['theory', 'Theory options'],
        ['lab', 'Lab options'],
    ];
    let html = '';
    groups.forEach((gr) => {
        const g = gr[0];
        const all = s.options.filter((o) => groupOf(o) === g);
        if (!all.length) return;
        const list = all
            .filter((o) => {
                if (
                    q &&
                    (o.faculty + ' ' + o.slots.join(' ') + ' ' + o.venue).toLowerCase().indexOf(q) <
                        0
                )
                    return false;
                if (state.hideClash && s.sel[g] !== o.id && conflictFor(s, g, o, items))
                    return false;
                return true;
            })
            .sort(
                (a, b) =>
                    Number(state.starredOptions.includes(facultySlotKey(b))) -
                    Number(state.starredOptions.includes(facultySlotKey(a)))
            );
        html +=
            '<div class="grp-h"><span class="eyebrow">' +
            gr[1] +
            '</span><span class="cnt">' +
            list.length +
            (list.length !== all.length ? ' of ' + all.length : '') +
            '</span></div>' +
            '<div class="opts" role="radiogroup" aria-label="' +
            gr[1] +
            '">' +
            (list.length
                ? list.map((o) => optionHtml(s, g, o, items)).join('')
                : '<div class="none">Nothing matches. Clear the search or show clashing options.</div>') +
            '</div>';
    });
    if (!html) html = '<div class="none">No options yet. Add an option by hand.</div>';
    el.innerHTML = html;
}

function renderPanel() {
    const el = $('#panel'),
        s = active(),
        top = el.scrollTop;
    if (!s) {
        el.innerHTML =
            '<div class="empty-p"><h2>Which subject are you planning?</h2><p>Add a subject, then choose from its available faculty and slot options or add an option by hand.</p>' +
            (ui.presetError ? '<div class="note">' + esc(ui.presetError) + '</div>' : '') +
            '<form data-form="add-subject" style="display:grid;gap:8px"><label class="lbl" for="newSubP">Subject name<input class="field" id="newSubP" name="name" placeholder="e.g. Operating Systems or CSE2005" autocomplete="off"></label>' +
            '<button class="btn primary" type="submit">Add subject</button></form></div>';
        return;
    }
    const th = s.options.find((o) => o.id === s.sel.theory),
        lb = s.options.find((o) => o.id === s.sel.lab);
    const pick = (o, g) =>
        '<div class="picked"><div class="pk"><b>' +
        esc(o.faculty) +
        '</b><small>' +
        esc(o.slots.join('+')) +
        (o.venue ? ' · ' + esc(o.venue) : '') +
        '</small></div>' +
        '<button class="icon-btn" data-act="unpick" data-g="' +
        g +
        '" aria-label="Remove ' +
        g +
        ' pick" style="color:inherit">' +
        icon('close', 18) +
        '</button></div>';
    el.innerHTML =
        '<div class="p-sec"><div class="eyebrow">Subject</div>' +
        (ui.renaming
            ? '<form class="edit" data-form="rename"><label class="lbl" for="r-name">Name<input class="field" id="r-name" name="name" value="' +
              esc(s.name) +
              '"></label><label class="lbl" for="r-code">Course code (optional)<input class="field" id="r-code" name="code" value="' +
              esc(s.code || '') +
              '" placeholder="CSE2005"></label><div class="acts"><button class="btn primary sm" type="submit">Save</button><button class="btn sm" type="button" data-act="rename-cancel">Cancel</button></div></form>'
            : '<div class="p-title"><span class="dot" style="--sc:' +
              s.color +
              ';margin-top:9px"></span><h2>' +
              esc(s.name) +
              '</h2><button class="icon-btn" data-act="rename" aria-label="Rename subject">' +
              icon('edit') +
              '</button></div>' +
              (s.code ? '<div><span class="code">' + esc(s.code) + '</span></div>' : '')) +
        '<div class="eyebrow" style="margin-top:4px">Your pick</div>' +
        (th || lb
            ? (th ? pick(th, 'theory') : '') + (lb ? pick(lb, 'lab') : '')
            : '<div class="none">Nothing picked yet. Choose a faculty below.</div>') +
        '</div>' +
        '<div class="p-sec"><div class="tools"><input class="field" id="filter" type="search" placeholder="Search faculty or slot" value="' +
        esc(ui.filter) +
        '" aria-label="Search options">' +
        '<button class="icon-btn' +
        (ui.manage ? ' on' : '') +
        '" data-act="manage" aria-pressed="' +
        ui.manage +
        '" aria-label="Edit or delete options" title="Edit or delete options">' +
        icon('edit') +
        '</button></div>' +
        '<label class="chk"><input type="checkbox" id="hideClash"' +
        (state.hideClash ? ' checked' : '') +
        '>Hide options that clash with my picks</label>' +
        '<div id="optlist" style="display:grid;gap:10px"></div>' +
        '<details class="fold" data-fold="manual"' +
        (ui.foldManual ? ' open' : '') +
        '><summary>' +
        icon('chevron_right', 18).replace('class="ms"', 'class="ms ch"') +
        'Add an option by hand</summary><form class="in" data-form="add-opt">' +
        '<label class="lbl" for="m-fac">Faculty<input class="field" id="m-fac" name="faculty" placeholder="Dr. Name Surname" autocomplete="off"></label>' +
        '<div class="edit"><div class="row"><label class="lbl" for="m-slots">Slots<input class="field" id="m-slots" name="slots" placeholder="A1+TA1" autocomplete="off"></label><label class="lbl" for="m-venue">Venue<input class="field" id="m-venue" name="venue" placeholder="SJT-711" autocomplete="off"></label></div></div>' +
        '<button class="btn primary sm" type="submit" style="justify-self:start">Add option</button></form></details>' +
        '</div>';
    renderOptions();
    el.scrollTop = top;
}

const renderBoard = createBoardRenderer({
    state,
    ui,
    active,
    analyse,
    label,
    shortName,
    icon,
    esc,
});
function renderTop(an) {
    const s = active(),
        c = $('#crumb');
    if (s) {
        c.hidden = false;
        c.innerHTML =
            '<span class="dot" style="--sc:' +
            s.color +
            '"></span><span class="t">' +
            esc(s.name) +
            '</span>';
    } else c.hidden = true;
    const st = $('#stat');
    const indicator = (group, name) => {
        const applicable = state.subjects.filter((subject) =>
            subject.options.some((option) => groupOf(option) === group)
        );
        const chosen = applicable.filter((subject) =>
            subject.options.some(
                (option) => groupOf(option) === group && option.id === subject.sel[group]
            )
        );
        const remaining = applicable.filter((subject) => !chosen.includes(subject));
        const subjectList = (subjects) =>
            subjects.length
                ? '<ul>' +
                  subjects
                      .map(
                          (subject) =>
                              '<li style="--sc:' +
                              subject.color +
                              '">' +
                              esc(subject.name) +
                              '</li>'
                      )
                      .join('') +
                  '</ul>'
                : '<p>None</p>';
        return (
            '<span class="stat-part ' +
            group +
            '" tabindex="0" aria-describedby="stat-' +
            group +
            '-tooltip">' +
            name +
            ' ' +
            chosen.length +
            '/' +
            applicable.length +
            '<span class="stat-tooltip" id="stat-' +
            group +
            '-tooltip" role="tooltip"><b>' +
            name +
            ' chosen</b>' +
            subjectList(chosen) +
            '<b>' +
            name +
            ' left to choose</b>' +
            subjectList(remaining) +
            '</span>' +
            '</span>'
        );
    };
    st.className = 'stat';
    st.innerHTML =
        indicator('theory', 'Theory') +
        indicator('lab', 'Lab') +
        (an.count
            ? '<span class="stat-clashes" title="' +
              an.count +
              (an.count === 1 ? ' clash' : ' clashes') +
              '">' +
              icon('error', 16) +
              an.count +
              '</span>'
            : '');
}
function render() {
    const an = analyse();
    renderTop(an);
    renderDrawer(an);
    renderPanel();
    renderBoard(an);
    if (!ui.presetError || state.subjects.length) save();
}

/* ---------- actions ---------- */
function effTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}
function paintThemeBtn() {
    const d = effTheme() === 'dark',
        b = $('#themeBtn');
    b.innerHTML = icon(d ? 'light_mode' : 'dark_mode');
    b.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode');
    b.title = d ? 'Switch to light mode' : 'Switch to dark mode';
}
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try {
        localStorage.setItem(STORAGE_KEY + '-theme', t);
    } catch (e) {
        /* ignore */
    }
    paintThemeBtn();
}
function initTheme() {
    try {
        const t = localStorage.getItem(STORAGE_KEY + '-theme');
        if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    } catch (e) {
        /* ignore */
    }
    paintThemeBtn();
}
let toastT;
function toast(m) {
    const t = $('#toast');
    t.textContent = m;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 3200);
}
function openDrawer() {
    $('#drawer').classList.add('on');
    $('#scrim').classList.add('on');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#menuBtn').setAttribute('aria-expanded', 'true');
    setTimeout(() => {
        const i = $('#newSubD');
        if (i) i.focus();
    }, 230);
}
function closeDrawer() {
    $('#drawer').classList.remove('on');
    $('#scrim').classList.remove('on');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
}
function sheetText() {
    const lines = [];
    state.subjects.forEach((s) => {
        const t = s.options.find((o) => o.id === s.sel.theory),
            l = s.options.find((o) => o.id === s.sel.lab);
        if (!t && !l) return;
        lines.push(s.name + (s.code ? ' (' + s.code + ')' : ''));
        if (t)
            lines.push(
                '  Theory: ' +
                    t.faculty +
                    ' · ' +
                    t.slots.join('+') +
                    (t.venue ? ' · ' + t.venue : '')
            );
        if (l)
            lines.push(
                '  Lab: ' + l.faculty + ' · ' + l.slots.join('+') + (l.venue ? ' · ' + l.venue : '')
            );
    });
    return lines.length ? lines.join('\n') : 'No faculty picked yet.';
}
function addSubject(name) {
    name = (name || '').trim();
    if (!name) {
        toast('Type a subject name first.');
        return;
    }
    ui.presetError = '';
    const cm = name.match(CODE_RE);
    const s = {
        id: uid(),
        name: name,
        code: cm ? cm[0] : '',
        color: COLORS[state.subjects.length % COLORS.length],
        options: [],
        sel: { theory: null, lab: null },
    };
    state.subjects.push(s);
    state.activeId = s.id;
    ui.filter = '';
    ui.editing = null;
    ui.renaming = false;
    closeDrawer();
    render();
    toast('Added ' + name + '. Choose a faculty option or add one by hand.');
}
document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act,
        id = t.dataset.id,
        s = active();
    if (act === 'theme') {
        applyTheme(effTheme() === 'dark' ? 'light' : 'dark');
        return;
    }
    if (act === 'open-drawer') return openDrawer();
    if (act === 'close-drawer') return closeDrawer();
    if (act === 'reset-plan') {
        resetSelections();
        return;
    }
    if (act === 'star-option' && s) {
        const option = s.options.find((item) => item.id === id);
        if (!option) return;
        const key = facultySlotKey(option);
        state.starredOptions = state.starredOptions.includes(key)
            ? state.starredOptions.filter((starred) => starred !== key)
            : [...state.starredOptions, key];
        render();
        return;
    }
    if (act === 'pick') {
        state.activeId = id;
        ui.editing = null;
        ui.renaming = false;
        ui.filter = '';
        closeDrawer();
        render();
        return;
    }
    if (act === 'del-sub') {
        if (ui.confirmDel !== id) {
            ui.confirmDel = id;
            renderDrawer(analyse());
            return;
        }
        ui.confirmDel = null;
        state.subjects = state.subjects.filter((x) => x.id !== id);
        if (state.activeId === id)
            state.activeId = state.subjects.length ? state.subjects[0].id : null;
        render();
        return;
    }
    if (act === 'sel' && s) {
        if (e.target.closest('.o-act')) return;
        const g = t.dataset.g;
        s.sel[g] = s.sel[g] === id ? null : id;
        render();
        return;
    }
    if (act === 'unpick' && s) {
        s.sel[t.dataset.g] = null;
        render();
        return;
    }
    if (act === 'manage') {
        ui.manage = !ui.manage;
        ui.editing = null;
        renderPanel();
        return;
    }
    if (act === 'edit') {
        ui.editing = id;
        renderPanel();
        const f = $('#e-fac');
        if (f) f.focus();
        return;
    }
    if (act === 'cancel-edit') {
        ui.editing = null;
        renderPanel();
        return;
    }
    if (act === 'del-opt' && s) {
        s.options = s.options.filter((o) => o.id !== id);
        ['theory', 'lab'].forEach((g) => {
            if (s.sel[g] === id) s.sel[g] = null;
        });
        ui.preview = null;
        render();
        return;
    }
    if (act === 'rename') {
        ui.renaming = true;
        renderPanel();
        const f = $('#r-name');
        if (f) f.focus();
        return;
    }
    if (act === 'rename-cancel') {
        ui.renaming = false;
        renderPanel();
        return;
    }
    if (act === 'open-sheet') {
        $('#sheetPre').textContent = sheetText();
        $('#sheet').hidden = false;
        return;
    }
    if (act === 'close-sheet') {
        $('#sheet').hidden = true;
        return;
    }
    if (act === 'copy-sheet') {
        const txt = sheetText();
        const fail = () => {
            const r = document.createRange();
            r.selectNodeContents($('#sheetPre'));
            const sl = getSelection();
            sl.removeAllRanges();
            sl.addRange(r);
            toast('Copy was blocked. The text is selected, press Ctrl+C.');
        };
        try {
            navigator.clipboard.writeText(txt).then(() => toast('Plan copied.'), fail);
        } catch (er) {
            fail();
        }
        return;
    }
});

document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const kind = f.dataset.form,
        s = active(),
        d = new FormData(f);
    if (kind === 'add-subject') {
        addSubject(d.get('name'));
        return;
    }
    if (!s) return;
    if (kind === 'rename') {
        const n = String(d.get('name') || '').trim();
        if (n) s.name = n;
        s.code = String(d.get('code') || '')
            .trim()
            .toUpperCase();
        ui.renaming = false;
        render();
        return;
    }
    if (kind === 'edit-opt') {
        const o = s.options.find((x) => x.id === f.dataset.id);
        if (!o) return;
        const sl = parseSlotString(d.get('slots'));
        if (!sl.length) {
            toast('Enter at least one valid slot, such as A1+TA1.');
            return;
        }
        o.faculty = String(d.get('faculty') || '').trim() || o.faculty;
        o.slots = sl;
        o.venue = String(d.get('venue') || '').trim();
        o.kind = kindOf(sl);
        ['theory', 'lab'].forEach((g) => {
            if (s.sel[g] === o.id && groupOf(o) !== g) s.sel[g] = null;
        });
        ui.editing = null;
        render();
        return;
    }
    if (kind === 'add-opt') {
        const fac = String(d.get('faculty') || '').trim(),
            sl = parseSlotString(d.get('slots'));
        if (!fac) {
            toast('Enter the faculty name.');
            return;
        }
        if (!sl.length) {
            toast('Enter at least one valid slot, such as A1+TA1.');
            return;
        }
        s.options.push({
            id: uid(),
            faculty: fac,
            slots: sl,
            venue: String(d.get('venue') || '').trim(),
            kind: kindOf(sl),
        });
        ui.foldManual = true;
        render();
        toast('Option added.');
        const m = $('#m-fac');
        if (m) m.focus();
    }
});

document.addEventListener('input', (e) => {
    if (e.target.id === 'filter') {
        ui.filter = e.target.value;
        renderOptions();
    }
});
document.addEventListener('change', (e) => {
    if (e.target.id === 'hideClash') {
        state.hideClash = e.target.checked;
        renderOptions();
        save();
    }
});
document.addEventListener(
    'toggle',
    (e) => {
        const d = e.target;
        if (!d.dataset || !d.dataset.fold) return;
        if (d.dataset.fold === 'manual') ui.foldManual = d.open;
    },
    true
);

/* hover preview */
document.addEventListener('mouseover', (e) => {
    const o = e.target.closest('.opt[data-id]');
    const id = o ? o.dataset.id : null;
    if (id !== ui.preview) {
        ui.preview = id;
        renderBoard();
    }
});
document.addEventListener('focusin', (e) => {
    const o = e.target.closest('.opt[data-id]');
    const id = o ? o.dataset.id : null;
    if (id !== ui.preview) {
        ui.preview = id;
        renderBoard();
    }
});
$('#panel').addEventListener('mouseleave', () => {
    if (ui.preview) {
        ui.preview = null;
        renderBoard();
    }
});

/* keyboard on options */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDrawer();
        $('#sheet').hidden = true;
        return;
    }
    const o = e.target.closest && e.target.closest('.opt[data-act="sel"]');
    if (o && e.target === o && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        o.click();
    }
});

async function initialize() {
    initTheme();
    try {
        const preset = await loadPreset();
        state.subjects = preset.subjects;
        state.activeId = preset.activeId;
        state.subjects.forEach((subject) => {
            const saved = cached.selections[subjectCacheKey(subject)];
            if (!saved || typeof saved !== 'object') return;
            ['theory', 'lab'].forEach((group) => {
                const option = subject.options.find(
                    (item) => groupOf(item) === group && optionCacheKey(item) === saved[group]
                );
                if (option) subject.sel[group] = option.id;
            });
        });
    } catch (error) {
        console.error('Could not load the bundled subject preset.', error);
        ui.presetError =
            'Could not load the bundled subject preset. Check that the app is served over HTTP, then reload or add a subject manually.';
        toast('Could not load the bundled subject preset.');
    }
    if (!state.subjects.some((s) => s.id === state.activeId))
        state.activeId = state.subjects.length ? state.subjects[0].id : null;
    render();
}

initialize();
