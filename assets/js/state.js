import { groupOf, kindOf } from './core.js';

export const COLORS = [
    '#1a73e8',
    '#1e8e3e',
    '#e37400',
    '#a142f4',
    '#0e9aa7',
    '#d01884',
    '#7c6f00',
    '#5f6368',
];
export const STORAGE_KEY = 'ffcs-slot-planner-v2';
const LEGACY_KEY = 'ffcs-slot-planner-v1';
let uidN = 0;

export const uid = () =>
    'i' + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 5);

export function subjectCacheKey(subject) {
    return subject.code || subject.name;
}

export function optionCacheKey(option) {
    return [groupOf(option), option.faculty, option.slots.join('+'), option.venue || ''].join('|');
}

export function facultySlotKey(option) {
    return [groupOf(option), option.faculty, option.slots.join('+')].join('|');
}

function loadCache() {
    let saved = null,
        currentRaw = null,
        legacy = null;
    try {
        currentRaw = localStorage.getItem(STORAGE_KEY);
        saved = currentRaw ? JSON.parse(currentRaw) : null;
    } catch (error) {
        console.warn('Could not read saved timetable preferences.', error);
    }
    try {
        const raw = localStorage.getItem(LEGACY_KEY);
        if (raw && !currentRaw) legacy = JSON.parse(raw);
    } catch (error) {
        console.warn('Could not migrate or remove legacy planner data.', error);
    }
    const selections =
        saved?.selections &&
        typeof saved.selections === 'object' &&
        !Array.isArray(saved.selections)
            ? saved.selections
            : {};
    if (legacy && Array.isArray(legacy.subjects)) {
        legacy.subjects.forEach((subject) => {
            if (!subject || !Array.isArray(subject.options) || !subject.sel) return;
            const selected = {};
            ['theory', 'lab'].forEach((group) => {
                const option = subject.options.find((item) => item.id === subject.sel[group]);
                if (option) selected[group] = optionCacheKey(option);
            });
            if (Object.keys(selected).length) selections[subjectCacheKey(subject)] = selected;
        });
    }
    const starredOptions = Array.isArray(saved?.starredOptions)
        ? saved.starredOptions.filter((key) => typeof key === 'string')
        : [];
    try {
        if (legacy && !currentRaw)
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ selections, starredOptions }));
        localStorage.removeItem(LEGACY_KEY);
    } catch (error) {
        console.warn('Could not migrate or remove legacy planner data.', error);
    }
    return { selections, starredOptions };
}

export const cached = loadCache();
export const state = {
    subjects: [],
    activeId: null,
    hideClash: false,
    starredOptions: cached.starredOptions,
};

const PRESET_INDEX_URL = new URL(
    '../../presets/btech-cse-fresher-2026-27/index.json',
    import.meta.url
);

export async function loadPreset() {
    const indexResponse = await fetch(PRESET_INDEX_URL, { cache: 'no-cache' });
    if (!indexResponse.ok)
        throw new Error(`Preset catalog request failed (${indexResponse.status}).`);

    const manifest = await indexResponse.json();
    if (!Array.isArray(manifest.subjects) || !manifest.subjects.length)
        throw new Error('Preset catalog does not contain any subjects.');

    const subjects = await Promise.all(
        manifest.subjects.map(async (entry, index) => {
            if (typeof entry.file !== 'string' || !/^[\w-]+\.json$/.test(entry.file))
                throw new Error(`Invalid preset file for ${entry.code || 'subject'}.`);

            const response = await fetch(new URL(entry.file, PRESET_INDEX_URL), {
                cache: 'no-cache',
            });
            if (!response.ok) throw new Error(`Could not load ${entry.code} (${response.status}).`);

            const preset = await response.json();
            if (
                preset.code !== entry.code ||
                !Array.isArray(preset.options) ||
                preset.options.length !== entry.option_count
            )
                throw new Error(`Preset data for ${entry.code} is incomplete.`);

            return {
                id: uid(),
                name: preset.name,
                code: preset.code,
                color: COLORS[index % COLORS.length],
                sel: { theory: null, lab: null },
                options: preset.options.map((option) => {
                    if (
                        typeof option.faculty !== 'string' ||
                        !Array.isArray(option.slots) ||
                        !option.slots.every((slot) => typeof slot === 'string')
                    )
                        throw new Error(`Preset option for ${entry.code} is invalid.`);

                    return {
                        id: uid(),
                        faculty: option.faculty,
                        slots: option.slots,
                        venue: option.venue || '',
                        kind: option.kind || kindOf(option.slots),
                    };
                }),
            };
        })
    );

    return { subjects, activeId: subjects[0].id, hideClash: false };
}

export function save() {
    try {
        const selections = {};
        state.subjects.forEach((subject) => {
            const selected = {};
            ['theory', 'lab'].forEach((group) => {
                const option = subject.options.find((item) => item.id === subject.sel[group]);
                if (option) selected[group] = optionCacheKey(option);
            });
            if (Object.keys(selected).length) selections[subjectCacheKey(subject)] = selected;
        });
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                selections,
                starredOptions: state.starredOptions,
            })
        );
    } catch (error) {
        console.warn('Could not save timetable preferences.', error);
    }
}
