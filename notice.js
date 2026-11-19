export const NOTE_KEYS = ['notice1', 'notice2', 'notice3', 'notice4', 'notice5', 'notice6'];

const longExamples = {
  notice1: '工事開始時間までに、必ずお車を出庫してください。',
  notice2: '工事期間中は、タワーパーキング内に車両を駐車しておくことはできません。',
  notice3: '工事期間中は、昼夜を問わず車両の入出庫が一切できません。',
  notice4: '操作盤の更新に伴い、鍵および取扱説明書が新しくなります。',
  notice5: '新しい鍵および取扱説明書は、利用再開までに配布予定です。',
  notice6: '工事期間中の代替駐車場については、別途ご案内いたします。',
};

const shortExamples = {
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

export function createDraft(mode, now = new Date()) {
  const common = {
    issueMonth: `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    recipient: '機械式駐車場 ご利用者 様',
    propertyName: '',
    workDescription: '',
    startDate: '',
    issuerName: '日精株式会社',
    contactPerson: '',
    contactPhone: '',
    contactHours: '平日９時～１７時',
  };
  if (mode === 'short') {
    return {
      ...common,
      title: '機械式駐車装置　部品交換作業のお知らせ',
      startTime: '10:00',
      endTime: '16:00',
      location: '',
      vehicleMode: 'stay',
      ...shortExamples.stay,
    };
  }
  return {
    ...common,
    title: '機械式駐車装置　制御リニューアル工事のお知らせ',
    startTime: '09:00',
    endDate: '',
    endTime: '14:00',
    resumeDate: '',
    resumeTime: '',
    legacyResumeText: '',
    ...longExamples,
    noteEnabled: Object.fromEntries(NOTE_KEYS.map(key => [key, true])),
  };
}

export function restoreDrafts(saved) {
  const drafts = { short: createDraft('short'), long: createDraft('long') };
  for (const [mode, draft] of Object.entries(drafts)) {
    const previous = saved?.[mode];
    if (!previous || typeof previous !== 'object') continue;
    for (const key of Object.keys(draft)) {
      if (typeof draft[key] === 'string' && typeof previous[key] === 'string') {
        draft[key] = previous[key];
      }
    }
    if (mode === 'long') {
      for (const key of NOTE_KEYS) {
        if (typeof previous.noteEnabled?.[key] === 'boolean') {
          draft.noteEnabled[key] = previous.noteEnabled[key];
        }
      }
      // The prototype accepted free text for reopening. Keep custom wording in
      // the editor until the user chooses a date/time for the current notice.
      const oldResume = cleanText(previous.resumeText);
      if (!Object.hasOwn(previous, 'resumeDate') && oldResume !== '最終日14時～利用再開予定') {
        draft.legacyResumeText = oldResume;
      }
    }
  }
  if (!Object.hasOwn(shortExamples, drafts.short.vehicleMode)) {
    setVehicleMode(drafts.short, 'stay');
  }
  return drafts;
}

export function setVehicleMode(draft, vehicleMode) {
  Object.assign(draft, { vehicleMode }, shortExamples[vehicleMode]);
}

export function sampleDraft(mode) {
  const common = {
    ...createDraft(mode),
    propertyName: '架空さくらマンション',
    issuerName: '架空設備株式会社',
    contactPerson: 'サンプル担当',
    contactPhone: '00-0000-0000',
  };
  if (mode === 'short') {
    return {
      ...common,
      issueMonth: '2032-02',
      startDate: '2032-02-29',
      workDescription: '油圧ポンプユニット交換作業',
      location: '2号機　※向かって右側',
    };
  }
  return {
    ...common,
    issueMonth: '2032-12',
    startDate: '2032-12-30',
    endDate: '2033-01-02',
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

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
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

const requiredText = {
  propertyName: '物件名',
  title: '案内文タイトル',
  workDescription: '工事内容',
  issuerName: '施工会社名',
  contactPhone: '電話番号',
};

export function validate(mode, draft) {
  const errors = new Map();
  for (const [key, label] of Object.entries(requiredText)) {
    if (!cleanText(draft[key])) errors.set(key, `${label}を入力してください。`);
  }
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

  if (mode === 'long' && (draft.resumeDate || draft.resumeTime)) {
    if (!dateParts(draft.resumeDate)) errors.set('resumeDate', '利用再開日を入力してください。');
    if (!validTime(draft.resumeTime)) errors.set('resumeTime', '利用再開時刻を入力してください。');
    if (end && !errors.has('resumeDate') && draft.resumeDate < endDate) {
      errors.set('resumeDate', '利用再開日を工事終了日以降にしてください。');
    } else if (end && draft.resumeDate === endDate && validTime(draft.endTime) &&
               validTime(draft.resumeTime) && draft.resumeTime < draft.endTime) {
      errors.set('resumeTime', '利用再開時刻を工事終了時刻以降にしてください。');
    }
  }
  return errors;
}

const noteGroups = {
  short: [['notice1'], ['notice2']],
  long: [['notice1', 'notice2'], ['notice3'], ['notice4', 'notice5'], ['notice6']],
};

function collectNotes(mode, draft) {
  const groups = noteGroups[mode].map(group => group.flatMap(key => {
    const text = cleanText(draft[key]);
    if (!text || (mode === 'long' && !draft.noteEnabled[key])) return [];
    return [{
      key,
      text,
      red: mode === 'short' || key === 'notice1' || key === 'notice3',
      secondary: mode === 'long' && (key === 'notice2' || key === 'notice5'),
      detail: mode === 'short' && key === 'notice2' ? cleanText(draft.notice2Detail) : '',
      gapAfter: 0,
    }];
  })).filter(group => group.length);
  groups.slice(0, -1).forEach(group => {
    group.at(-1).gapAfter = mode === 'short' ? 30 : 15;
  });
  return groups.flat();
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
  const notes = collectNotes(mode, draft);
  const values = {
    issue: month ? `${fullWidth(draft.issueMonth.slice(0, 4))}年${fullWidth(month[1])}月吉日` : '［発行年月未入力］',
    recipient: cleanText(draft.recipient),
    issuer: `施工会社：${issuer}`,
    title: cleanText(draft.title) || '［案内文タイトル未入力］',
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
      closure: draft.vehicleMode === 'custom'
        ? (notes.length ? '下記の工事日時と注意事項をご確認ください。' : '下記の工事日時をご確認ください。')
        : '工事中は駐車場のご利用が不可となります。',
      mainDate: date,
      timeRange: `${startTime} ～ ${endTime}`,
      locationLabel: location ? '【作業場所】' : '',
      location,
      notice2Detail: notes.find(note => note.key === 'notice2')?.detail || '',
    });
  } else {
    const lastDay = dateLabel(end, fullEnd);
    const hasResume = draft.resumeDate || draft.resumeTime;
    const resumeAt = hasResume
      ? `${dateLabel(dateParts(draft.resumeDate))} ${timeLabel(draft.resumeTime)}`
      : (end && validTime(draft.endTime) ? `最終日${endTime}` : '工事終了後');
    Object.assign(values, {
      intro: `平素より${property}をご利用いただきありがとうございます。${date}～${lastDay}に、「${work}」を行います。`,
      closure: notes.length
        ? '工事期間中のご利用については、下記の注意事項をご確認ください。'
        : '下記の工事期間・作業内容をご確認ください。',
      startLine: `${date}　${startTime} ～`,
      endLine: `${lastDay}　${endTime}`,
      resume: `（${resumeAt}から利用再開予定）`,
      workDescription: work,
    });
  }

  for (const key of mode === 'short' ? NOTE_KEYS.slice(0, 2) : NOTE_KEYS) {
    const note = notes.find(item => item.key === key);
    values[key] = note?.text || '';
    if (mode === 'short' || (key !== 'notice2' && key !== 'notice5')) {
      values[key.replace('notice', 'bullet')] = note ? '◆' : '';
    }
  }
  return {
    mode, values, notes, fullEnd,
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
    if (textWidth(draft[key]) > limit) warnings.push(`${label}が長いため、折り返しを確認してください。`);
  }
  if (payload.notes.some(note => textWidth(note.text) > 52 || textWidth(note.detail) > 42)) {
    warnings.push('注意事項が長いため、折り返しや改ページを確認してください。');
  }
  if (textWidth(payload.values.contact) > 48) {
    warnings.push('連絡先が長いため、折り返しを確認してください。');
  }
  if (mode === 'short' && !payload.values.notice2 && cleanText(draft.notice2Detail)) {
    warnings.push('注意事項②が空欄のため、補足は出力されません。');
  }
  if (mode === 'long' && NOTE_KEYS.some(key => draft.noteEnabled[key] && !cleanText(draft[key]))) {
    warnings.push('表示がオンでも、本文が空欄の注意事項は出力されません。');
  }
  return warnings;
}

export function wordFilename(draft) {
  const name = cleanText(draft.propertyName)
    .replace(/[\\/:*?"<>|\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const shortName = Array.from(name).slice(0, 48).join('') || '物件名未入力';
  return `${draft.startDate}_${shortName}_工事案内文.docx`;
}
