import {
    DAYS,
    LAB_TIMES,
    LABS,
    THEORY,
    TH_TIMES,
    groupOf,
    intervals,
    mins,
    slotIds,
} from './core.js';

export function createBoardRenderer({ state, ui, active, analyse, label, shortName, icon, esc }) {
    const segOf = (start) => (start < 820 ? 0 : 1);

    function pill(it, slot, kind, bad, ghost) {
        const slotLabel = slot + (it.opt.venue ? '-(' + it.opt.venue + ')' : '');
        return (
            '<div class="pill' +
            (kind === 'lab' ? ' lab' : '') +
            (bad ? ' bad' : '') +
            (ghost ? ' ghost' : '') +
            '" style="--sc:' +
            it.subject.color +
            '" title="' +
            esc(
                it.subject.name +
                    ' \u00b7 ' +
                    it.opt.faculty +
                    ' \u00b7 ' +
                    slotLabel +
                    (ghost ? ' (preview)' : '')
            ) +
            '"><b><span class="dot" style="--sc:' +
            it.subject.color +
            '"></span><span class="t">' +
            esc(label(it.subject)) +
            '</span></b><i>' +
            esc(slotLabel) +
            '</i><small>' +
            esc(shortName(it.opt.faculty)) +
            '</small></div>'
        );
    }

    function cellHtml(day, slot, kind, start, end, ctx) {
        const aliases = slotIds(slot);
        const occ = ctx.an.items.filter((it) =>
            aliases.some((alias) => it.opt.slots.indexOf(alias) >= 0)
        );
        let content = '';
        occ.forEach((it) => {
            const matchedSlot = aliases.find((alias) => it.opt.slots.includes(alias));
            content += pill(
                it,
                matchedSlot,
                kind,
                occ.length > 1 ||
                    aliases.some((alias) => ctx.an.keys.has(it.opt.id + '|' + day + '|' + alias)),
                false
            );
        });
        const preview = ctx.preview;
        if (preview && aliases.some((alias) => preview.opt.slots.includes(alias))) {
            const matchedSlot = aliases.find((alias) => preview.opt.slots.includes(alias));
            const bad = ctx.against.some(
                (item) => item.day === day && item.start < end && start < item.end
            );
            content += pill(preview, matchedSlot, kind, bad, true);
        }
        return (
            '<div class="sc">' +
            (content || '<div class="sid">' + aliases.join('/') + '</div>') +
            '</div>'
        );
    }

    function headTrack(kind, segment, row) {
        const times = kind === 'theory' ? TH_TIMES : LAB_TIMES;
        let content =
                '<div class="tr hd" style="grid-column:' +
                (segment ? 5 : 3) +
                ';grid-row:' +
                row +
                '">',
            count = 0;
        times.forEach((time) => {
            if (segOf(mins(time[0])) !== segment) return;
            content += '<div class="th">' + time[0] + '-' + time[1] + '</div>';
            count++;
        });
        for (; count < 6; count++) content += '<div class="th">&nbsp;</div>';
        return content + '</div>';
    }

    function dayTrack(day, kind, segment, row, ctx, last) {
        const times = kind === 'theory' ? TH_TIMES : LAB_TIMES,
            grid = kind === 'theory' ? THEORY[day] : LABS[day];
        let content =
                '<div class="tr' +
                (last ? ' dend' : '') +
                '" style="grid-column:' +
                (segment ? 5 : 3) +
                ';grid-row:' +
                row +
                '">',
            count = 0;
        grid.forEach((slot, index) => {
            const start = mins(times[index][0]),
                end = mins(times[index][1]);
            if (segOf(start) === segment) {
                content += cellHtml(day, slot, kind, start, end, ctx);
                count++;
            }
        });
        for (; count < 6; count++) content += '<div class="sc"><div class="sid">-</div></div>';
        return content + '</div>';
    }

    function matrixHtml(ctx) {
        let content =
            '<div class="mx"><div class="dy h" style="grid-column:1;grid-row:1/3">Day</div>' +
            '<div class="ty" style="grid-column:2;grid-row:1">Theory</div><div class="ty lab" style="grid-column:2;grid-row:2">Lab</div>' +
            headTrack('theory', 0, 1) +
            headTrack('theory', 1, 1) +
            headTrack('lab', 0, 2) +
            headTrack('lab', 1, 2) +
            '<div class="lunch">LUNCH</div>';
        DAYS.forEach((day, index) => {
            const row = 3 + index * 2;
            content +=
                '<div class="dy" style="grid-column:1;grid-row:' +
                row +
                '/span 2">' +
                day +
                '</div>' +
                '<div class="ty" style="grid-column:2;grid-row:' +
                row +
                '">Theory</div><div class="ty lab" style="grid-column:2;grid-row:' +
                (row + 1) +
                ';border-bottom-color:var(--line)">Lab</div>' +
                dayTrack(day, 'theory', 0, row, ctx, false) +
                dayTrack(day, 'theory', 1, row, ctx, false) +
                dayTrack(day, 'lab', 0, row + 1, ctx, true) +
                dayTrack(day, 'lab', 1, row + 1, ctx, true);
        });
        return content + '</div>';
    }

    return function renderBoard(an) {
        an = an || analyse();
        const subject = active();
        let preview = null,
            shown = an;
        if (ui.preview && subject) {
            const option = subject.options.find((item) => item.id === ui.preview);
            if (option && subject.sel[groupOf(option)] !== option.id) {
                preview = { subject, group: groupOf(option), opt: option };
                shown = analyse(
                    (item) => item.subject.id === subject.id && item.group === preview.group
                );
            }
        }
        const against = [];
        if (preview)
            shown.items.forEach((item) =>
                intervals(item.opt).forEach((range) => against.push(range))
            );
        const ctx = { an: shown, preview, against };
        let banners = '';
        if (an.count) {
            banners +=
                '<div class="banner bad">' +
                icon('error', 20) +
                '<div><b>' +
                an.count +
                (an.count === 1 ? ' clash' : ' clashes') +
                ' in your picks</b><ul>' +
                an.msgs
                    .slice(0, 6)
                    .map((message) => '<li>' + esc(message) + '</li>')
                    .join('') +
                '</ul></div></div>';
        } else if (an.items.length) {
            banners +=
                '<div class="banner ok">' +
                icon('check_circle', 20) +
                '<div><b>Conflict-free.</b> ' +
                an.items.length +
                (an.items.length === 1 ? ' pick is' : ' picks are') +
                ' placed with no overlaps.</div></div>';
        } else {
            banners +=
                '<div class="banner">' +
                icon('info', 20) +
                '<div>Pick a faculty option for each subject. Hover an option to preview where it lands.</div></div>';
        }
        const legend =
            '<div class="legend"><span><i class="lg s"></i>Theory</span><span><i class="lg l"></i>Lab</span><span><i class="lg p"></i>Preview (replaces your current pick)</span><span><i class="lg c"></i>Clash</span></div>';
        document.querySelector('#board').innerHTML =
            banners +
            '<div class="tt-card"><div class="tt-head"><h3>Weekly timetable</h3>' +
            legend +
            '</div>' +
            (state.subjects.length
                ? '<div class="subs">' +
                  state.subjects
                      .map(
                          (item) =>
                              '<span><i class="dot" style="--sc:' +
                              item.color +
                              '"></i><b style="font-weight:500">' +
                              esc(item.name) +
                              '</b>' +
                              (item.code ? '<em>' + esc(item.code) + '</em>' : '') +
                              '</span>'
                      )
                      .join('') +
                  '</div>'
                : '') +
            '<div class="tt-scroll">' +
            matrixHtml(ctx) +
            '</div></div>';
    };
}
