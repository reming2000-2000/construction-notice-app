export const NOTE_KEYS = ['notice1', 'notice2', 'notice3', 'notice4', 'notice5', 'notice6'];
export const OPTIONAL_NOTE_KEYS = NOTE_KEYS.slice(3);

const longExamples = {
  notice1: '工事開始時間までに、必ずお車を出庫してください。',
  notice2: '工事期間中は、タワーパーキング内に車両を駐車しておくことはできません。',
  notice3: '工事期間中は、昼夜を問わず車両の入出庫が一切できません。',
  notice4: '操作盤の更新に伴い、鍵および取扱説明書が新しくなります。',
  notice5: '新しい鍵および取扱説明書は、利用再開までに配布予定です。',
  notice6: '工事期間中の代替駐車場については、別途ご案内いたします。',
};

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
  stay: '駐車中の車は移動不要',
  leave: '事前出庫が必要',
  unrestricted: '利用制限なし',
};

function validRestrictionMode(mode, choice) {
  return choice === 'work' || choice === 'continuous' || (mode === 'long' && choice === 'daily');
}

function validResumeMode(choice) {
  return ['restriction', 'custom', 'unknown'].includes(choice);
}

export function createDraft(mode, now = new Date()) {
  const common = {
    issueMonth: `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    recipient: '機械式駐車場 ご利用者 様',
    propertyName: '',
    workDescription: '',
    startDate: '',
    startTime: '',
    endTime: '',
    vehicleMode: '',
    deadlineDate: '',
    deadlineTime: '',
    restrictionMode: '',
    restrictionStartDate: '',
    restrictionStartTime: '',
    restrictionEndDate: '',
    restrictionEndTime: '',
    resumeMode: '',
    resumeDate: '',
    resumeTime: '',
    legacyResumeText: '',
    legacyVehicleNotes: '',
    issuerName: '日精株式会社',
    contactPerson: '',
    contactPhone: '',
    contactHours: '平日９時～１７時',
  };
  if (mode === 'short') {
    return {
      ...common,
      title: '機械式駐車装置　部品交換作業のお知らせ',
      location: '',
      notice2Detail: '',
    };
  }
  return {
    ...common,
    title: '機械式駐車装置　制御リニューアル工事のお知らせ',
    endDate: '',
    ...Object.fromEntries(OPTIONAL_NOTE_KEYS.map(key => [key, longExamples[key]])),
    noteEnabled: Object.fromEntries(OPTIONAL_NOTE_KEYS.map(key => [key, false])),
  };
}

function restoreLegacyOptions(mode, draft, previous) {
  // The old controls supplied a vehicle rule and a reopening assumption even
  // when no one chose them. Keep old edits visible as reference only.
  draft.vehicleMode = '';
  draft.restrictionMode = '';
  draft.resumeMode = '';
  const oldVehicleMode = Object.hasOwn(legacyShortExamples, previous.vehicleMode) ? previous.vehicleMode : 'stay';
  const examples = mode === 'short' ? legacyShortExamples[oldVehicleMode] : longExamples;
  const ruleKeys = mode === 'short' ? ['notice1', 'notice2', 'notice2Detail'] : NOTE_KEYS.slice(0, 3);
  const editedRules = ruleKeys.map(key => cleanText(previous[key]))
    .filter((text, index) => text && text !== examples[ruleKeys[index]]);
  if (editedRules.length) draft.legacyVehicleNotes = editedRules.join(' ／ ');
  if (mode === 'short') draft.notice2Detail = '';

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
    if (legacy) restoreLegacyOptions(mode, draft, previous);
    if (!Object.hasOwn(vehicleLabels, draft.vehicleMode)) draft.vehicleMode = '';
    if (!validRestrictionMode(mode, draft.restrictionMode)) draft.restrictionMode = '';
    if (!validResumeMode(draft.resumeMode)) draft.resumeMode = '';
    if (mode === 'long') {
      for (const key of OPTIONAL_NOTE_KEYS) {
        // A legacy default checkmark did not establish a choice. An edited
        // note that was enabled retains its status along with the edited text.
        const previousText = cleanText(draft[key]);
        draft.noteEnabled[key] = previous.noteEnabled?.[key] === true &&
          (!legacy || (previousText !== '' && previousText !== longExamples[key]));
      }
    }
  }
  return drafts;
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
    deadlineDate: '2032-12-30',
    deadlineTime: '08:30',
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

function workSpan(mode, draft) {
  return {
    startDate: draft.startDate,
    startTime: draft.startTime,
    endDate: mode === 'short' ? draft.startDate : draft.endDate,
    endTime: draft.endTime,
  };
}

function restrictionSpan(mode, draft, work) {
  if (draft.restrictionMode === 'work') return work;
  const daily = mode === 'long' && draft.restrictionMode === 'daily';
  return {
    startDate: daily ? work.startDate : draft.restrictionStartDate,
    startTime: draft.restrictionStartTime,
    endDate: daily ? work.endDate : draft.restrictionEndDate,
    endTime: draft.restrictionEndTime,
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

function validateVehicleRules(errors, mode, draft, work) {
  if (!Object.hasOwn(vehicleLabels, draft.vehicleMode)) {
    errors.set('vehicleMode', '車両の扱いを選択してください。');
    return;
  }
  if (draft.vehicleMode === 'unrestricted') return;

  if (!validRestrictionMode(mode, draft.restrictionMode)) {
    errors.set('restrictionMode', '入出庫を停止する期間の指定方法を選択してください。');
  } else if (draft.restrictionMode === 'continuous') {
    requireDateTime(errors, draft, 'restrictionStart', '入出庫停止の開始');
    requireDateTime(errors, draft, 'restrictionEnd', '入出庫停止の終了');
    const { restrictionStartDate: start, restrictionEndDate: end } = draft;
    if (dateParts(start) && dateParts(end) && end < start) {
      errors.set('restrictionEndDate', '入出庫停止の終了日を、開始日以降にしてください。');
    } else if (start === end && validTime(draft.restrictionStartTime) && validTime(draft.restrictionEndTime) &&
               draft.restrictionEndTime <= draft.restrictionStartTime) {
      errors.set('restrictionEndTime', '入出庫停止の終了時刻を、開始時刻より後にしてください。');
    }
  } else if (draft.restrictionMode === 'daily') {
    if (!validTime(draft.restrictionStartTime)) errors.set('restrictionStartTime', '各日の停止開始時刻を入力してください。');
    if (!validTime(draft.restrictionEndTime)) {
      errors.set('restrictionEndTime', '各日の停止終了時刻を入力してください。');
    } else if (validTime(draft.restrictionStartTime) && draft.restrictionEndTime <= draft.restrictionStartTime) {
      errors.set('restrictionEndTime', '各日の停止終了時刻を、同じ日の開始時刻より後にしてください。');
    }
  }

  const stop = restrictionSpan(mode, draft, work);
  const start = timestamp(stop.startDate, stop.startTime);
  const end = timestamp(stop.endDate, stop.endTime);
  const validStop = !errors.has('restrictionMode') && !errors.has('restrictionEndTime') && start && end && start < end;
  if (draft.vehicleMode === 'leave') {
    requireDateTime(errors, draft, 'deadline', '出庫期限の');
    const deadline = timestamp(draft.deadlineDate, draft.deadlineTime);
    if (validStop && deadline && deadline > start) {
      const key = draft.deadlineDate === stop.startDate ? 'deadlineTime' : 'deadlineDate';
      errors.set(key, '出庫期限を、入出庫停止の開始日時までにしてください。');
    }
  }
  if (!validResumeMode(draft.resumeMode)) {
    errors.set('resumeMode', '利用再開予定の指定方法を選択してください。');
  } else if (draft.resumeMode === 'custom') {
    requireDateTime(errors, draft, 'resume', '利用再開');
    const resume = timestamp(draft.resumeDate, draft.resumeTime);
    if (validStop && resume && resume < end) {
      const key = draft.resumeDate === stop.endDate ? 'resumeTime' : 'resumeDate';
      errors.set(key, '利用再開を、入出庫停止の終了日時以降にしてください。');
    }
  }
}

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

  validateVehicleRules(errors, mode, draft, workSpan(mode, draft));
  return errors;
}

const noteGroups = {
  short: [['notice1'], ['notice2']],
  long: [['notice1', 'notice2'], ['notice3'], ['notice4', 'notice5'], ['notice6']],
};

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

function vehicleRuleCopy(mode, draft, work) {
  const vehicle = Object.hasOwn(vehicleLabels, draft.vehicleMode) ? vehicleLabels[draft.vehicleMode] : '';
  const deadline = timestamp(draft.deadlineDate, draft.deadlineTime);
  const deadlineLabel = deadline ? dateTimeLabel(draft.deadlineDate, draft.deadlineTime) : '';
  const summary = { vehicle: vehicle || '要選択', deadline: '要選択', restriction: '要選択', resume: '要選択' };
  const copy = { summary, vehicleNotice: '', vehicleDetail: '', restrictionNotice: '', resumeNotice: '' };
  if (!vehicle) return copy;
  if (draft.vehicleMode === 'unrestricted') {
    Object.assign(summary, { deadline: '不要', restriction: 'なし', resume: '対象外' });
    copy.vehicleNotice = '駐車場は通常どおりご利用いただけます。';
    return copy;
  }

  if (draft.vehicleMode === 'leave') {
    summary.deadline = deadlineLabel || '要入力';
    copy.vehicleNotice = deadlineLabel && `${deadlineLabel}までに車を出してください。`;
  } else {
    summary.deadline = '不要';
    copy.vehicleNotice = '駐車中の車は移動不要です。';
  }

  if (!validRestrictionMode(mode, draft.restrictionMode)) return copy;
  const stop = restrictionSpan(mode, draft, work);
  const stopStart = timestamp(stop.startDate, stop.startTime);
  const stopEnd = timestamp(stop.endDate, stop.endTime);
  const daily = draft.restrictionMode === 'daily';
  const validStop = stopStart && stopEnd && stopStart < stopEnd && (!daily || stop.startTime < stop.endTime);
  const relatesToFinalDay = daily ? '最終日の停止後は、' : '';
  if (draft.resumeMode === 'unknown') {
    summary.resume = `${relatesToFinalDay}利用再開は未定。決まり次第お知らせします。`;
    copy.resumeNotice = '利用再開は未定・別途案内';
  } else if (draft.resumeMode === 'restriction' || draft.resumeMode === 'custom') {
    const date = draft.resumeMode === 'custom' ? draft.resumeDate : stop.endDate;
    const time = draft.resumeMode === 'custom' ? draft.resumeTime : stop.endTime;
    const selectedAt = timestamp(date, time);
    if (selectedAt) copy.resumeNotice = `${dateTimeLabel(date, time)}から利用再開予定`;
    summary.resume = copy.resumeNotice ? `${relatesToFinalDay}${copy.resumeNotice}` : '要入力';
  }

  const stopLabel = daily
    ? `工事期間中の各日 ${timeLabel(stop.startTime)} ～ ${timeLabel(stop.endTime)}`
    : spanLabel(stop, '\n');
  // Keep the clock together inside the original Word notice column.
  summary.restriction = validStop ? stopLabel.replace(/[０-９：]/g, digit => digit.normalize('NFKC')) : '要入力';
  if (!validStop) return copy;
  if (daily && draft.vehicleMode === 'leave' && stop.startDate !== stop.endDate) {
    const eachDay = `２日目以降は各日${timeLabel(stop.startTime)}まで`;
    if (deadlineLabel) summary.deadline = `${deadlineLabel}（初回）／${eachDay}`;
    copy.vehicleDetail = `${eachDay}に車を出してください。`;
  }
  const extended = draft.resumeMode === 'unknown' ||
    (draft.resumeMode === 'custom' && timestamp(draft.resumeDate, draft.resumeTime) > stopEnd);
  if (extended) {
    const finalDay = daily ? '最終日は、' : '';
    summary.restriction += `（予定）\n${finalDay}利用再開まで入出庫できません。`;
  }
  copy.restrictionNotice = `【入出庫停止】${summary.restriction}`;
  return copy;
}

function collectNotes(mode, draft, copy) {
  const short = mode === 'short';
  const supplement = short ? cleanText(draft.notice2Detail) : '';
  const generated = {
    notice1: copy.vehicleNotice,
    notice2: short ? copy.restrictionNotice || (supplement ? '【補足】' : '') : copy.vehicleDetail,
    notice3: copy.restrictionNotice,
  };
  const groups = noteGroups[mode].map(group => group.flatMap(key => {
    const text = generated[key] ?? (draft.noteEnabled[key] ? cleanText(draft[key]) : '');
    if (!text) return [];
    return [{
      key,
      text,
      red: short || key === 'notice1' || key === 'notice3',
      secondary: !short && (key === 'notice2' || key === 'notice5'),
      detail: short && key === 'notice2' ? [copy.resumeNotice, supplement].filter(Boolean).join('　') : '',
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
  const workPeriod = workSpan(mode, draft);
  const vehicleRules = vehicleRuleCopy(mode, draft, workPeriod);
  const notes = collectNotes(mode, draft, vehicleRules);
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
      closure: notes.length ? '下記の工事日時と注意事項をご確認ください。' : '下記の工事日時をご確認ください。',
      mainDate: date,
      timeRange: `${startTime} ～ ${endTime}`,
      locationLabel: location ? '【作業場所】' : '',
      location,
      notice2Detail: notes.find(note => note.key === 'notice2')?.detail || '',
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
      resume: vehicleRules.resumeNotice ? `（${vehicleRules.resumeNotice}）` : '',
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
    workSchedule: spanLabel(workPeriod),
    vehicleSummary: vehicleRules.summary,
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
  if (mode === 'long' && OPTIONAL_NOTE_KEYS.some(key => draft.noteEnabled[key] && !cleanText(draft[key]))) {
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
