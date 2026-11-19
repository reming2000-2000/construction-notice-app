export const NOTE_KEYS = ['notice1', 'notice2', 'notice3', 'notice4', 'notice5', 'notice6'];
const legacyLongNoteKeys = NOTE_KEYS.slice(3);
const legacyNoteExamples = { notice4: 'keys', notice5: 'distribution', notice6: 'parking' };

const longExamples = {
  notice1: '工事開始時間までに、必ずお車を出庫してください。',
  notice2: '工事期間中は、タワーパーキング内に車両を駐車しておくことはできません。',
  notice3: '工事期間中は、昼夜を問わず車両の入出庫が一切できません。',
  notice4: '操作盤の更新に伴い、鍵および取扱説明書が新しくなります。',
  notice5: '新しい鍵および取扱説明書は、利用再開までに配布予定です。',
  notice6: '工事期間中の代替駐車場については、別途ご案内いたします。',
};

export const additionalOptions = [
  { id: 'parking', label: '代替駐車場の別途案内', group: 'common', text: longExamples.notice6 },
  { id: 'timing', label: '終了時刻の変動', group: 'common', text: '工事の進捗により、終了時刻が前後する場合があります。' },
  { id: 'resume', label: '利用再開予定日時', group: 'common' },
  { id: 'keys', label: '鍵・取扱説明書の変更', group: 'other', text: '工事に伴い、鍵および取扱説明書が新しくなります。' },
  { id: 'distribution', label: '新しい鍵の配布', group: 'other', text: longExamples.notice5 },
  { id: 'spaces', label: '指定車室のみ事前出庫', group: 'other' },
];

const restrictionCopy = {
  work: '工事時間中は、車両の入出庫が一切できません。',
  continuous: '工事期間中は、昼夜を問わず車両の入出庫が一切できません。',
};

export function canSelectNotice(draft, id) {
  if (id === 'distribution') return draft.selectedNotices.includes('keys');
  if (id === 'spaces') return draft.vehicleMode !== 'leave';
  return true;
}

export function selectAdditionalNotice(draft, id, checked) {
  if (checked && canSelectNotice(draft, id)) {
    if (!draft.selectedNotices.includes(id)) draft.selectedNotices.push(id);
  } else {
    draft.selectedNotices = draft.selectedNotices.filter(key => key !== id);
    if (id === 'keys') draft.selectedNotices = draft.selectedNotices.filter(key => key !== 'distribution');
  }
}

const legacyShortExamples = {
  stay: {
    notice1: '工事時間中は、車両の入出庫が一切できません。',
    notice2: '車両は入庫したままで問題ありません。',
    notice2Detail: '但し出庫はできません。',
  },
  leave: {
    notice1: longExamples.notice1,
    notice2: '工事時間中は、車両の入出庫が一切できません。',
    notice2Detail: '',
  },
  custom: { notice1: '', notice2: '', notice2Detail: '' },
};

const vehicleLabels = {
  stay: '入出庫不可・車両残置可',
  leave: '入出庫不可・事前出庫必須',
  restricted: '入出庫不可のみ',
};

export const contactFields = ['issuerName', 'contactPerson', 'contactPhone', 'contactHours'];

export function noticeTitle(draft) {
  if (draft.titleMode === 'manual') return cleanText(draft.title);
  const work = cleanText(draft.workDescription).normalize('NFKC');
  const matches = [
    [/制御.*(?:リニューアル|更新|交換)|(?:リニューアル|更新).*制御/, '制御リニューアル工事'],
    [/交換|取[り]?替え?/, '部品交換作業'],
  ];
  const subject = matches.find(([pattern]) => pattern.test(work))?.[1] ?? '工事';
  return `機械式駐車装置　${subject}のお知らせ`;
}

export function createDraft(mode, now = new Date()) {
  const common = {
    issueMonth: `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    recipient: '機械式駐車場 ご利用者 様',
    propertyName: '',
    workDescription: '',
    titleMode: 'auto',
    title: '',
    startDate: '',
    startTime: '',
    endTime: '',
    vehicleMode: 'stay',
    restrictionMode: 'work',
    restrictionColor: 'red',
    resumeMode: 'restriction',
    resumeDate: '',
    resumeTime: '',
    legacyResumeText: '',
    legacyVehicleNotes: '',
    selectedNotices: [],
    noticeOverrides: {},
    targetSpaces: '',
    additionalNotes: [],
    issuerName: '日精株式会社',
    contactPerson: '',
    contactPhone: '',
    contactHours: '平日９時～１７時',
  };
  if (mode === 'short') {
    return {
      ...common,
      location: '',
    };
  }
  return {
    ...common,
    endDate: '',
  };
}

export function hasDraftInput(mode, draft) {
  const defaults = createDraft(mode);
  return Object.keys(defaults).some(key => {
    if (contactFields.includes(key)) return false;
    if (key === 'additionalNotes') return draft[key].some(note => noticeText(note.text));
    if (key === 'selectedNotices') return draft[key].length > 0;
    if (key === 'noticeOverrides') return Object.keys(draft[key]).length > 0;
    return draft[key] !== defaults[key];
  });
}

export function carryDraft(from, to, source, destination) {
  const sourceDefaults = createDraft(from);
  const result = { ...destination };

  for (const key of Object.keys(sourceDefaults)) {
    if (!Object.hasOwn(destination, key)) continue;
    if (key === 'additionalNotes') {
      result.additionalNotes = source.additionalNotes.map(note => ({ ...note }));
    } else if (key === 'selectedNotices') {
      result.selectedNotices = [...source.selectedNotices];
    } else if (key === 'noticeOverrides') {
      result.noticeOverrides = { ...source.noticeOverrides };
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function restoreLegacyOptions(mode, draft, previous) {
  // The earliest drafts used implicit vehicle rules. Preserve their wording for review.
  draft.vehicleMode = '';
  draft.restrictionMode = '';
  const oldVehicleMode = Object.hasOwn(legacyShortExamples, previous.vehicleMode) ? previous.vehicleMode : 'stay';
  const examples = mode === 'short' ? legacyShortExamples[oldVehicleMode] : longExamples;
  const ruleKeys = mode === 'short' ? ['notice1', 'notice2', 'notice2Detail'] : NOTE_KEYS.slice(0, 3);
  const editedRules = ruleKeys.map(key => cleanText(previous[key]))
    .filter((text, index) => text && text !== examples[ruleKeys[index]]);
  if (editedRules.length) draft.legacyVehicleNotes = editedRules.join(' ／ ');

  const oldResume = cleanText(previous.resumeText);
  if (oldResume && oldResume !== '最終日14時～利用再開予定') draft.legacyResumeText = oldResume;
}

export function restoreDrafts(saved) {
  const drafts = { short: createDraft('short'), long: createDraft('long') };
  for (const [mode, draft] of Object.entries(drafts)) {
    const previous = saved?.[mode];
    if (!previous || typeof previous !== 'object') continue;
    const legacy = !Object.hasOwn(previous, 'restrictionMode') || !Object.hasOwn(previous, 'resumeMode');
    for (const key of Object.keys(draft)) {
      if (typeof draft[key] === 'string' && typeof previous[key] === 'string') {
        draft[key] = previous[key];
      }
    }
    const current = Array.isArray(previous.selectedNotices);
    if (!Object.hasOwn(previous, 'titleMode') && cleanText(draft.title)) draft.titleMode = 'manual';
    if (draft.titleMode !== 'manual') draft.titleMode = 'auto';
    if (legacy) restoreLegacyOptions(mode, draft, previous);
    if (!Object.hasOwn(vehicleLabels, draft.vehicleMode)) draft.vehicleMode = '';
    if (!Object.hasOwn(restrictionCopy, draft.restrictionMode)) draft.restrictionMode = '';
    if (draft.restrictionColor !== 'black') draft.restrictionColor = 'red';
    if (draft.resumeMode !== 'custom') draft.resumeMode = 'restriction';
    draft.additionalNotes = restoreAdditionalNotes(mode, previous, legacy);
    if (current) {
      for (const { id, text } of additionalOptions) {
        if (previous.selectedNotices.includes(id)) selectAdditionalNotice(draft, id, true);
        if (text && typeof previous.noticeOverrides?.[id] === 'string') {
          draft.noticeOverrides[id] = previous.noticeOverrides[id];
        }
      }
    } else {
      migrateNoticeChoices(mode, draft, previous);
    }
  }
  return drafts;
}

function restoreAdditionalNotes(mode, previous, legacy) {
  if (Array.isArray(previous.additionalNotes)) {
    return previous.additionalNotes.flatMap(note => {
      if (typeof note?.text !== 'string') return [];
      const restored = { text: note.text, enabled: note.enabled !== false };
      if (typeof note.exampleId === 'string') restored.exampleId = note.exampleId;
      return [restored];
    });
  }
  if (mode === 'short') {
    const text = noticeText(previous.notice2Detail);
    return !legacy && text ? [{ text, enabled: true }] : [];
  }
  return legacyLongNoteKeys.flatMap(key => {
    const text = typeof previous[key] === 'string' ? noticeText(previous[key]) : longExamples[key];
    const edited = text !== longExamples[key];
    const enabled = previous.noteEnabled?.[key] === true && (!legacy || edited);
    return text && (previous.noteEnabled?.[key] === true || edited)
      ? [{ text, enabled, exampleId: legacyNoteExamples[key] }]
      : [];
  });
}

function migrateNoticeChoices(mode, draft, previous) {
  const work = workSpan(mode, draft);
  const reminder = [];
  if (previous.vehicleMode === 'unrestricted') {
    reminder.push('以前の設定では駐車場を通常どおり利用できる案内でした。車両の扱いを選び直してください。');
  }
  if (previous.restrictionMode === 'daily' || previous.restrictionMode === 'continuous') {
    const start = timestamp(previous.restrictionStartDate, previous.restrictionStartTime);
    const end = timestamp(previous.restrictionEndDate, previous.restrictionEndTime);
    const isWorkSpan = start && end && start === timestamp(work.startDate, work.startTime) &&
      end === timestamp(work.endDate, work.endTime);
    if (previous.restrictionMode === 'daily') {
      reminder.push(`以前の毎日の入出庫停止は ${previous.restrictionStartTime || '未入力'}～${previous.restrictionEndTime || '未入力'} です。`);
    } else if (!isWorkSpan) {
      reminder.push(`以前の入出庫停止期間は ${previous.restrictionStartDate || '未入力'} ${previous.restrictionStartTime || '未入力'}～${previous.restrictionEndDate || '未入力'} ${previous.restrictionEndTime || '未入力'} です。`);
    }
    draft.restrictionMode = previous.restrictionMode === 'continuous' && isWorkSpan ? 'continuous' : '';
  }
  if (previous.vehicleMode === 'leave' && previous.deadlineDate && previous.deadlineTime &&
      timestamp(previous.deadlineDate, previous.deadlineTime) !== timestamp(work.startDate, work.startTime)) {
    reminder.push(`以前の出庫期限は ${previous.deadlineDate} ${previous.deadlineTime} です。`);
    draft.vehicleMode = '';
  }
  if (previous.vehicleMode === 'stay' || previous.vehicleMode === 'leave') {
    if (previous.resumeMode === 'custom') selectAdditionalNotice(draft, 'resume', true);
    if (previous.resumeMode === 'restriction') {
      const date = previous.restrictionMode === 'continuous' ? previous.restrictionEndDate : work.endDate;
      const time = ['continuous', 'daily'].includes(previous.restrictionMode) ? previous.restrictionEndTime : work.endTime;
      const end = timestamp(date, time);
      if (end && end >= timestamp(work.endDate, work.endTime)) {
        if (date !== work.endDate || time !== work.endTime) {
          draft.resumeMode = 'custom';
          draft.resumeDate = date;
          draft.resumeTime = time;
        }
        selectAdditionalNotice(draft, 'resume', true);
      } else if (end) {
        draft.legacyResumeText ||= `${date} ${time} から利用再開予定`;
      }
    }
  }
  if (previous.resumeMode === 'unknown') {
    draft.legacyResumeText ||= '利用再開の日時は、決まり次第お知らせします。';
  }
  // Bring forward active equivalents. Keep orphaned or edited inactive text in the original editor.
  for (const option of additionalOptions) {
    if (!option.text) continue;
    const index = draft.additionalNotes.findIndex(note => note.enabled &&
      (note.exampleId === option.id || (!note.exampleId && noticeText(note.text) === option.text)));
    if (index < 0) continue;
    if (!canSelectNotice(draft, option.id)) {
      draft.additionalNotes[index].enabled = false;
      reminder.push(`以前の「${option.label}」は自由入力に保存しました。掲載条件を確認してください。`);
      continue;
    }
    const [note] = draft.additionalNotes.splice(index, 1);
    selectAdditionalNotice(draft, option.id, true);
    if (note.text !== option.text && !Object.values(longExamples).includes(note.text)) {
      draft.noticeOverrides[option.id] = note.text;
    }
  }
  draft.legacyVehicleNotes = [draft.legacyVehicleNotes, ...reminder].filter(Boolean).join(' ／ ');
}

export function sampleDraft(mode) {
  const common = {
    ...createDraft(mode),
    propertyName: '架空さくらマンション',
    issuerName: '架空設備株式会社',
    contactPerson: 'サンプル担当',
    contactPhone: '00-0000-0000',
    restrictionMode: 'work',
    resumeMode: 'restriction',
  };
  if (mode === 'short') {
    return {
      ...common,
      issueMonth: '2032-02',
      startDate: '2032-02-29',
      startTime: '10:00',
      endTime: '16:00',
      vehicleMode: 'stay',
      workDescription: '油圧ポンプユニット交換作業',
      location: '2号機　※向かって右側',
    };
  }
  return {
    ...common,
    issueMonth: '2032-12',
    startDate: '2032-12-30',
    endDate: '2033-01-02',
    startTime: '09:00',
    endTime: '14:00',
    vehicleMode: 'leave',
    workDescription: '制御装置の更新・パネル交換',
  };
}

export function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(value + 'T00:00:00Z');
  if (year < 1 || date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return { year, month, day, weekday: '日月火水木金土'[date.getUTCDay()] };
}

function monthParts(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value.startsWith('0000-')) return null;
  return value.split('-').map(Number);
}

export function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeTimeInput(value) {
  const text = value.normalize('NFKC').trim();
  const match = /^(\d{1,2}):?(\d{2})$/.exec(text);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : text;
}

function fullWidth(value) {
  return String(value).replace(/[0-9:]/g, char => String.fromCharCode(char.charCodeAt(0) + 0xfee0));
}

function dateLabel(date, withYear = true) {
  if (!date) return '［日付未入力］';
  const year = withYear ? `${fullWidth(String(date.year).padStart(4, '0'))}年` : '';
  return `${year}${fullWidth(date.month)}月${fullWidth(date.day)}日（${date.weekday}）`;
}

function timeLabel(time) {
  return validTime(time) ? fullWidth(time) : '［時刻未入力］';
}

function cleanText(value) {
  // A single line of valid XML 1.0 text, including supplementary Unicode.
  return (typeof value === 'string' ? value : '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu, '')
    .replace(/[\n\r\t]/g, ' ')
    .trim();
}

function noticeText(value) {
  return typeof value === 'string'
    ? value.split(/\r?\n/).map(line => cleanText(line).replace(/^(?:◆\s*)+/, '')).filter(Boolean).join('\n')
    : '';
}

const requiredText = {
  propertyName: '物件名',
  workDescription: '工事内容',
  issuerName: '施工会社名',
  contactPhone: '電話番号',
};

function workSpan(mode, draft) {
  return {
    startDate: draft.startDate,
    startTime: draft.startTime,
    endDate: mode === 'short' ? draft.startDate : draft.endDate,
    endTime: draft.endTime,
  };
}

function timestamp(date, time) {
  return dateParts(date) && validTime(time) ? `${date}T${time}` : '';
}

function requireDateTime(errors, draft, prefix, description) {
  const dateKey = `${prefix}Date`;
  const timeKey = `${prefix}Time`;
  if (!dateParts(draft[dateKey])) errors.set(dateKey, `${description}日を入力してください。`);
  if (!validTime(draft[timeKey])) errors.set(timeKey, `${description}時刻を入力してください。`);
}

function resumePoint(draft, work) {
  return draft.resumeMode === 'custom'
    ? { date: draft.resumeDate, time: draft.resumeTime }
    : { date: work.endDate, time: work.endTime };
}

function validateVehicleRules(errors, draft, work) {
  if (!Object.hasOwn(vehicleLabels, draft.vehicleMode)) errors.set('vehicleMode', '基本の注意事項を選択してください。');
  if (!Object.hasOwn(restrictionCopy, draft.restrictionMode)) errors.set('restrictionMode', '入出庫制限期間を選択してください。');

  if (!draft.selectedNotices.includes('resume') || draft.resumeMode !== 'custom') return;
  requireDateTime(errors, draft, 'resume', '利用再開');
  const resume = timestamp(draft.resumeDate, draft.resumeTime);
  const end = timestamp(work.endDate, work.endTime);
  if (end && resume && resume < end) {
    const key = draft.resumeDate === work.endDate ? 'resumeTime' : 'resumeDate';
    errors.set(key, '利用再開予定を、工事終了日時以降にしてください。');
  }
}

export function validate(mode, draft) {
  const errors = new Map();
  for (const [key, label] of Object.entries(requiredText)) {
    if (!cleanText(draft[key])) errors.set(key, `${label}を入力してください。`);
  }
  if (!noticeTitle(draft)) errors.set('title', '案内文タイトルを入力してください。');
  if (!monthParts(draft.issueMonth)) errors.set('issueMonth', '発行年月を入力してください。');

  const start = dateParts(draft.startDate);
  const end = mode === 'long' ? dateParts(draft.endDate) : start;
  if (!start) errors.set('startDate', '開始日を入力してください。');
  if (mode === 'long' && !end) errors.set('endDate', '終了日を入力してください。');
  if (!validTime(draft.startTime)) errors.set('startTime', '開始時刻を入力してください。');
  if (!validTime(draft.endTime)) errors.set('endTime', '終了時刻を入力してください。');

  const endDate = mode === 'long' ? draft.endDate : draft.startDate;
  if (start && end && endDate < draft.startDate) {
    errors.set('endDate', '終了日を開始日以降にしてください。');
  } else if ((mode === 'short' || (start && endDate === draft.startDate)) &&
             validTime(draft.startTime) && validTime(draft.endTime) &&
             draft.endTime <= draft.startTime) {
    errors.set('endTime', '終了時刻を開始時刻より後にしてください。');
  }

  validateVehicleRules(errors, draft, workSpan(mode, draft));
  return errors;
}

function dateTimeLabel(date, time) {
  return `${dateLabel(dateParts(date))} ${timeLabel(time)}`;
}

function spanLabel(span, endDateSeparator = ' ') {
  const start = dateParts(span.startDate);
  const end = dateParts(span.endDate);
  const showEndDate = !start || !end || span.startDate !== span.endDate;
  const endLabel = showEndDate ? `${endDateSeparator}${dateLabel(end, !start || !end || start.year !== end.year)} ` : ' ';
  return `${dateLabel(start)} ${timeLabel(span.startTime)} ～${endLabel}${timeLabel(span.endTime)}`;
}

function resumeSentence(point, work) {
  const date = dateParts(point.date);
  if (!date || !validTime(point.time) || timestamp(point.date, point.time) < timestamp(work.endDate, work.endTime)) return '';
  const [hour, minute] = point.time.split(':').map(Number);
  const year = date.year !== dateParts(work.startDate)?.year ? `${date.year}年` : '';
  const time = `${hour}時${minute ? `${minute}分` : ''}`;
  return `駐車場の利用再開は、${year}${date.month}月${date.day}日（${date.weekday}）${time}を予定しております。`;
}

function collectNotes(mode, draft, work) {
  const short = mode === 'short';
  const restriction = Object.hasOwn(restrictionCopy, draft.restrictionMode) ? restrictionCopy[draft.restrictionMode] : '';
  const limited = draft.selectedNotices.includes('spaces') && canSelectNotice(draft, 'spaces');
  const spaces = cleanText(draft.targetSpaces);
  const parked = limited ? '対象車室以外の車両は入庫したままで問題ありません。' : '車両は入庫したままで問題ありません。';
  const rule = draft.vehicleMode === 'leave' ? '工事開始までに、必ずお車を出庫してください。' :
    draft.vehicleMode === 'stay' ? parked : '';
  const point = resumePoint(draft, work);
  const resume = draft.selectedNotices.includes('resume') ? resumeSentence(point, work) : '';
  const notes = [
    { key: 'notice1', text: restriction, red: draft.restrictionColor !== 'black' },
    { key: short ? 'notice2' : 'notice3', text: rule, red: draft.vehicleMode === 'leave' },
  ].filter(note => note.text);
  const added = new Set(notes.map(note => note.text.normalize('NFKC').replace(/\s/g, '')));
  const append = (value, source) => {
    const text = noticeText(value);
    const normalized = text.normalize('NFKC').replace(/\s/g, '');
    if (!normalized || added.has(normalized)) return;
    added.add(normalized);
    notes.push({ text, additional: true, red: source.optionId === 'spaces', ...source });
  };
  for (const { id, text } of additionalOptions) {
    if (!draft.selectedNotices.includes(id) || !canSelectNotice(draft, id)) continue;
    const value = id === 'resume' ? resume :
      id === 'spaces' ? `対象車室${spaces ? `（${spaces}）` : ''}のお車は、工事開始までに出庫してください。` :
      noticeText(draft.noticeOverrides[id]) || text;
    append(value, { optionId: id });
  }
  for (const [freeIndex, note] of draft.additionalNotes.entries()) {
    if (note.enabled) append(note.text, { freeIndex });
  }
  return {
    notes,
    summary: {
      vehicle: vehicleLabels[draft.vehicleMode] || '要選択',
      deadline: draft.vehicleMode === 'leave' || limited
        ? `${limited ? '対象車室は' : ''}${dateTimeLabel(work.startDate, work.startTime)}（工事開始）まで` : '—',
      restriction: restriction || '要選択',
      resume: resume || (draft.selectedNotices.includes('resume') ? '要入力' : '掲載しない'),
    },
  };
}

export function noticePayload(mode, draft) {
  const month = monthParts(draft.issueMonth);
  const start = dateParts(draft.startDate);
  const end = mode === 'long' ? dateParts(draft.endDate) : start;
  const fullEnd = !!(start && end && start.year !== end.year);
  const date = dateLabel(start);
  const startTime = timeLabel(draft.startTime);
  const endTime = timeLabel(draft.endTime);
  const property = cleanText(draft.propertyName) || '［物件名未入力］';
  const work = cleanText(draft.workDescription) || '［工事内容未入力］';
  const issuer = cleanText(draft.issuerName) || '［施工会社名未入力］';
  const phone = cleanText(draft.contactPhone) || '［電話番号未入力］';
  const person = cleanText(draft.contactPerson);
  const hours = cleanText(draft.contactHours);
  const workPeriod = workSpan(mode, draft);
  const { notes, summary } = collectNotes(mode, draft, workPeriod);
  const values = {
    issue: month ? `${fullWidth(draft.issueMonth.slice(0, 4))}年${fullWidth(month[1])}月吉日` : '［発行年月未入力］',
    recipient: cleanText(draft.recipient),
    issuer: `施工会社：${issuer}`,
    title: noticeTitle(draft) || '［案内文タイトル未入力］',
    contact: [
      `${issuer}：${phone}`,
      person && `（担当：${person}）`,
      hours && `受付時間：${hours}`,
    ].filter(Boolean).join(' '),
    notesHeading: notes.length ? '【注意事項】' : '',
  };

  if (mode === 'short') {
    const location = cleanText(draft.location);
    Object.assign(values, {
      intro: `平素より${property}の機械式駐車場をご利用いただきありがとうございます。`,
      introDate: `${date}に、「${work}」を行います。`,
      closure: notes.length ? '下記の工事日時と注意事項をご確認ください。' : '下記の工事日時をご確認ください。',
      mainDate: date,
      timeRange: `${startTime} ～ ${endTime}`,
      locationLabel: location ? '【作業場所】' : '',
      location,
    });
  } else {
    const lastDay = dateLabel(end, fullEnd);
    Object.assign(values, {
      intro: `平素より${property}をご利用いただきありがとうございます。${date}～${lastDay}に、「${work}」を行います。`,
      closure: notes.length
        ? '工事期間中のご利用については、下記の注意事項をご確認ください。'
        : '下記の工事期間・作業内容をご確認ください。',
      startLine: `${date}　${startTime} ～`,
      endLine: `${lastDay}　${endTime}`,
      resume: '',
      workDescription: work,
    });
  }

  for (const key of mode === 'short' ? NOTE_KEYS.slice(0, 2) : NOTE_KEYS) {
    const note = notes.find(item => item.key === key);
    values[key] = note?.text || '';
    if (mode === 'short' || (key !== 'notice2' && key !== 'notice5')) {
      values[key.replace('notice', 'bullet')] = note ? '◆ ' : '';
    }
  }
  if (mode === 'short') values.notice2Detail = '';
  return {
    mode, values, notes, fullEnd,
    compactSchedule: mode === 'short' && !values.location,
    workSchedule: spanLabel(workPeriod),
    vehicleSummary: summary,
    // The longest full-width date plus time can wrap at the original 20 pt.
    compactStart: mode === 'long' && start?.month >= 10 && start.day >= 10,
    // The original long outline has room for two 14 pt work lines.
    extraOutlineLines: mode === 'long' ? Math.max(0, Math.ceil(textWidth(work) / 30) - 2) : 0,
  };
}

function textWidth(value) {
  return Array.from(cleanText(value)).reduce((width, char) => {
    return width + (/[MW@]/.test(char) ? 0.95 : /[\u0020-\u007E\uFF61-\uFF9F]/.test(char) ? 0.55 : 1);
  }, 0);
}

export function layoutWarnings(mode, draft, payload) {
  const warnings = [];
  const wideFields = [
    ['title', '案内文タイトル', 25], ['propertyName', '物件名', 28],
    ['workDescription', '工事内容', 50], ['location', '作業場所', 25],
  ];
  for (const [key, label, limit] of wideFields) {
    const value = key === 'title' ? payload.values.title : draft[key];
    if (textWidth(value) > limit) warnings.push(`${label}が長いため、折り返しを確認してください。`);
  }
  if (payload.notes.some(note => note.text.split('\n').some(line => textWidth(line) > 52))) {
    warnings.push('注意事項が長いため、折り返しや改ページを確認してください。');
  }
  if (textWidth(payload.values.contact) > 48) {
    warnings.push('連絡先が長いため、折り返しを確認してください。');
  }
  return warnings;
}

export function noticeWarnings(payload) {
  const restriction = payload.notes.find(note => note.key === 'notice1');
  const continuous = restriction?.text === restrictionCopy.continuous;
  const instructions = payload.notes.map(note => {
    const result = { note, park: false, depart: false, permit: false };
    for (const sentence of note.text.split(/[。\n]+/)) {
      // Treat only clear instructions as candidates. Avoid comparing a
      // conditional or limited vehicle instruction with a rule for every space.
      const scoped = /車室|区画|対象|指定|一部|以外|場合|除く/.test(sentence);
      result.park ||= !scoped && /(?:車両|お車).{0,12}(?:入庫|駐車)(?:した)?まま(?:で|でも)(?:問題ありません|構いません|大丈夫です)/.test(sentence);
      result.depart ||= !scoped && /(?:工事|作業)(?:の)?(?:前に|開始(?:時刻|時間)?までに).{0,22}(?:出庫|移動)を?(?:してください|願います|お願いします)/.test(sentence);
      const permission = /(?:工事|作業)(時間|期間)?中.{0,18}(?:入出庫|出し入れ)(?:は|が)?(?:できます|可能です)[！! \t]*$/.exec(sentence);
      result.permit ||= !!permission && !/場合|終了後|時間外/.test(sentence) &&
        (continuous || (permission[1] !== '期間' && !/夜間|休工日/.test(sentence)));
    }
    return result;
  });
  const allowsParking = instructions.some(item => item.park);
  const requiresDeparture = instructions.some(item => item.depart);
  const warnings = [];
  for (const { note, park, depart, permit } of instructions) {
    if (!note.additional) continue;
    if (restriction && permit) {
      warnings.push({ note, message: '入出庫制限と、工事中も入出庫できると読める注意事項が食い違う可能性があります。' });
    }
    if ((park && requiresDeparture) || (depart && allowsParking)) {
      warnings.push({ note, message: '車両を残せるという案内と、事前出庫を求める案内が食い違う可能性があります。' });
    }
  }
  return warnings;
}

function safePropertyFilename(draft) {
  const name = cleanText(draft.propertyName)
    .replace(/[\\/:*?"<>|\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  return Array.from(name).slice(0, 48).join('') || '物件名未入力';
}

export function wordFilename(draft) {
  return `${draft.startDate}_${safePropertyFilename(draft)}_工事案内文.docx`;
}

export const maxCaseBytes = 1024 * 1024;
const caseFormat = 'construction-notice-draft';
const caseVersion = 1;

export function exportCase(mode, draft) {
  const text = JSON.stringify({ format: caseFormat, version: caseVersion, mode, title: noticeTitle(draft), draft }, null, 2);
  return { text, filename: `工事案内文_${safePropertyFilename(draft)}.json` };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function importCase(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('JSONファイルを読み取れませんでした。');
  }
  if (!isRecord(file) || file.format !== caseFormat) throw new Error('工事案内文の案件データを選択してください。');
  if (file.version !== caseVersion) throw new Error('このバージョンの案件データには対応していません。');
  const { mode, draft } = file;
  if (!['short', 'long'].includes(mode) || !isRecord(draft)) throw new Error('案内の種類または入力内容が不正です。');
  const fields = createDraft(mode);
  const options = additionalOptions.map(({ id }) => id);
  const customOptions = additionalOptions.filter(({ text }) => text).map(({ id }) => id);
  const allowedValues = {
    titleMode: ['auto', 'manual'],
    vehicleMode: ['', ...Object.keys(vehicleLabels)],
    restrictionMode: ['', ...Object.keys(restrictionCopy)],
    restrictionColor: ['red', 'black'],
    resumeMode: ['restriction', 'custom'],
  };
  const invalidFields = Object.entries(fields).some(([key, value]) =>
    typeof value === 'string' && (!Object.hasOwn(draft, key) || typeof draft[key] !== 'string' ||
      (allowedValues[key] && !allowedValues[key].includes(draft[key]))));
  if (invalidFields || !Array.isArray(draft.selectedNotices) ||
      draft.selectedNotices.some(id => !options.includes(id)) || !isRecord(draft.noticeOverrides) ||
      Object.entries(draft.noticeOverrides).some(([key, value]) => !customOptions.includes(key) || typeof value !== 'string') ||
      !Array.isArray(draft.additionalNotes) || draft.additionalNotes.some(note =>
        !isRecord(note) || typeof note.text !== 'string' || typeof note.enabled !== 'boolean' ||
        (Object.hasOwn(note, 'exampleId') && typeof note.exampleId !== 'string'))) {
    throw new Error('案件データの入力項目または注意事項が不正です。');
  }
  return { mode, draft: restoreDrafts({ [mode]: draft })[mode] };
}
