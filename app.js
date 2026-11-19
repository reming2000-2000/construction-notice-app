/* Static browser app. The preview, browser print and Word share one notice payload. */
import {
  createDraft, restoreDrafts, sampleDraft, validate, noticePayload,
  layoutWarnings, wordFilename, hasDraftInput, carryDraft, validTime, normalizeTimeInput,
  additionalOptions, canSelectNotice, selectAdditionalNotice,
  noticeTitle, noticeWarnings, contactFields, exportCase, importCase, maxCaseBytes,
} from './notice.js';
import { loadWordTemplate, createWord } from './word.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const storageKey = 'parkingNoticeDrafts';
const modes = { short: '短期工事', long: '長期工事' };
let exporting = false;
let pendingReview = null;
let pendingMode = '';
let pendingCase = null;
let caseRead = 0;
let layoutFrame;
let textWarnings = [];
const printMedia = window.matchMedia('print');
const choices = [];
const ruleInputs = $$('input[name="vehicleMode"], input[name="restrictionMode"]');
const titleInput = $('[data-field="title"]');

function putText(id, text) {
  const node = document.getElementById(id);
  if (node.textContent !== text) node.textContent = text;
}

function renderIntro(short, { values, introParts }) {
  putText(short ? 'vIntro' : 'vIntroDate', short ? values.intro : '');
  const dated = document.getElementById(short ? 'vIntroDate' : 'vIntro');
  dated.replaceChildren(...introParts.map(({ text, red }) => {
    if (!red) return document.createTextNode(text);
    const date = document.createElement('span');
    date.className = 'intro-date';
    date.textContent = text;
    return date;
  }));
}

function storageWarning() {
  const status = $('#storageStatus');
  status.hidden = false;
  status.textContent = 'このブラウザでは下書きを保存できません。ページを閉じる前に必要な案内文を保存してください。';
}

function loadDraftState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return {
      drafts: restoreDrafts(saved),
      mode: saved?.mode === 'long' ? 'long' : 'short',
      linked: saved?.linked === true,
      savedExamples: Array.isArray(saved?.savedExamples) ? saved.savedExamples.filter(example =>
        typeof example?.id === 'string' && example.id.startsWith('custom-') &&
        typeof example?.text === 'string' && example.text.trim()) : [],
    };
  } catch {
    storageWarning();
    return { drafts: restoreDrafts(null), mode: 'short', linked: false, savedExamples: [] };
  }
}

const initialState = loadDraftState();
const { drafts, savedExamples } = initialState;
let { mode, linked } = initialState;

function saveDrafts() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...drafts, mode, linked, savedExamples }));
    $('#storageStatus').hidden = true;
  } catch {
    storageWarning();
  }
}

function inputMode(input) {
  return input.closest('[data-modeonly]')?.dataset.modeonly ?? mode;
}

function timeEditor(select) {
  return select.closest('.time-entry').querySelector('[data-time-custom]');
}

function setTimeField(select, value) {
  select.querySelector('[data-saved-time]')?.remove();
  const editor = timeEditor(select);
  if (validTime(value) && !/:(00|30)$/.test(value)) {
    const option = new Option(`${value}（設定済み）`, value);
    option.dataset.savedTime = '';
    select.add(option, select.querySelector('[value="custom"]'));
  }
  const custom = value && !validTime(value);
  select.value = custom ? 'custom' : value;
  editor.value = custom ? value : '';
  editor.hidden = !custom;
}

function updateForm() {
  $$('[data-modeonly]').forEach(node => { node.hidden = node.dataset.modeonly !== mode; });
  $$('[data-field]').forEach(input => {
    const value = drafts[inputMode(input)][input.dataset.field] ?? '';
    if (input.hasAttribute('data-time-select')) setTimeField(input, value);
    else input.value = value;
  });
  for (const input of ruleInputs) input.checked = input.value === drafts[mode][input.name];
  for (const { option, editor } of choices) {
    if (editor) editor.value = drafts[mode].noticeOverrides[option.id] ?? option.text;
  }
  renderNoteChoices();
  renderNoteEditors();
  showNoteStatus();
  for (const key of Object.keys(modes)) {
    const button = $(`#${key}Button`);
    button.classList.toggle('active', mode === key);
    button.setAttribute('aria-pressed', String(mode === key));
  }
  render();
}

function updateNoticeChoices(draft, payload) {
  for (const { option, input, detail, preview, help } of choices) {
    input.disabled = !canSelectNotice(draft, option.id);
    input.checked = !input.disabled && draft.selectedNotices.includes(option.id);
    detail.hidden = !input.checked;
    if (preview) {
      const message = payload.notes.find(note => note.optionId === option.id)?.text;
      preview.textContent = message || (option.id === 'resume' && payload.vehicleSummary.resume === '要入力'
        ? '利用再開の日時を指定してください。' : '');
      preview.hidden = !input.checked || !preview.textContent;
    }
    if (help && option.id !== 'parking') {
      help.hidden = !input.disabled;
      if (input.disabled) input.setAttribute('aria-describedby', help.id);
      else input.removeAttribute('aria-describedby');
    }
  }
  $('#resumeSettings').hidden = !draft.selectedNotices.includes('resume');
  $('#resumeCustomFields').hidden = draft.resumeMode !== 'custom';
  $('#targetSpacesField').hidden = !draft.selectedNotices.includes('spaces') || !canSelectNotice(draft, 'spaces');
}

function showExportStatus(message = '', error = false) {
  const status = $('#exportStatus');
  status.hidden = !message;
  status.classList.toggle('error', error);
  putText('exportStatus', message);
}

function setMode(next) {
  if (mode === next) return;
  const hasInput = hasDraftInput(mode, drafts[mode]);
  if (!linked && hasInput && hasDraftInput(next, drafts[next])) {
    pendingMode = next;
    const existing = drafts[next].propertyName.trim();
    const name = existing ? `「${existing}」の` : '';
    putText('switchDraftDescription',
      `${modes[next]}に${name}下書きがあります。いまの案内を続けるか、保存済みの下書きを開くか選んでください。`);
    $('#draftSwitchDialog').showModal();
    $('#switchCancelButton').focus();
    return;
  }
  switchDraft(next, linked || hasInput);
}

function showModeStatus(message = '') {
  $('#modeStatus').hidden = !message;
  putText('modeStatus', message);
}

function switchDraft(next, carry) {
  if (carry) {
    const base = linked ? drafts[next] : createDraft(next);
    drafts[next] = carryDraft(mode, next, drafts[mode], base);
  }
  linked = carry;
  mode = next;
  if (!exporting) showExportStatus();
  updateForm();
  saveDrafts();
  showModeStatus(carry
    ? `${modes[next]}に共通の入力を引き継ぎました。${next === 'short' ? '工事は開始日と同じ日に終了します。' : ''}`
    : `${modes[next]}の下書きを開きました。`);
}

function finishDraftSwitch(action) {
  const next = pendingMode;
  pendingMode = '';
  $('#draftSwitchDialog').close();
  if (next && action !== 'cancel') switchDraft(next, action === 'carry');
}

function renderNotes(payload) {
  const list = $('#vNotes');
  list.replaceChildren();
  for (const note of payload.notes) {
    const row = document.createElement('div');
    row.className = 'notice-line';
    row.classList.toggle('red', !!note.red);
    row.classList.toggle('extra-note', !!note.additional);
    const bullet = document.createElement('span');
    bullet.className = 'notice-bullet';
    bullet.textContent = '◆ ';
    bullet.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'note-text';
    text.textContent = note.text;
    row.append(bullet, text);
    list.append(row);
  }
  putText('vNotesHeading', payload.values.notesHeading);
  $('#vNotesSection').hidden = !payload.notes.length;
}

function updateNotes() {
  if (!exporting) showExportStatus();
  $$('[data-note-example]').forEach(input => {
    input.checked = drafts[mode].additionalNotes.some(note => note.exampleId === input.value && note.enabled);
  });
  render();
  saveDrafts();
}

function showNoteStatus(message = '') {
  $('#noteStatus').hidden = !message;
  putText('noteStatus', message);
}

function initNoticeChoices() {
  const hints = {
    parking: '代替駐車場を別途案内することが決まっている場合に選択してください。',
    distribution: '「鍵・取扱説明書の変更」を選ぶと追加できます。',
    spaces: '全車両の事前出庫を求める場合は選択できません。',
  };
  for (const option of additionalOptions) {
    const { id, label, text, group } = option;
    const row = document.createElement('div');
    row.className = 'preset-row';
    const choice = document.createElement('label');
    choice.className = 'choice-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.presetId = id;
    const caption = document.createElement('span');
    caption.textContent = label;
    choice.append(input, caption);
    row.append(choice);

    let help;
    if (hints[id]) {
      help = document.createElement('p');
      help.className = 'help preset-help';
      help.id = `help-preset-${id}`;
      help.textContent = hints[id];
      input.setAttribute('aria-describedby', help.id);
      row.append(help);
    }
    let editor;
    let detail;
    const preview = document.createElement('p');
    preview.className = 'help preset-detail preset-preview';
    row.append(preview);
    if (text) {
      detail = document.createElement('details');
      detail.className = 'editor-details preset-detail';
      const summary = document.createElement('summary');
      summary.textContent = '定型文を個別に編集';
      const field = document.createElement('label');
      field.className = 'field';
      const instruction = document.createElement('span');
      instruction.textContent = '掲載文（この案内のみ編集可）';
      editor = document.createElement('textarea');
      editor.rows = 2;
      editor.dataset.presetText = id;
      editor.id = `preset-text-${id}`;
      editor.setAttribute('aria-label', `${label}の掲載文`);
      editor.addEventListener('input', () => {
        const overrides = drafts[mode].noticeOverrides;
        if (editor.value.trim() && editor.value !== text) overrides[id] = editor.value;
        else delete overrides[id];
        updateNotes();
      });
      editor.addEventListener('blur', () => {
        if (!editor.value.trim()) editor.value = text;
      });
      field.append(instruction, editor);
      detail.append(summary, field);
    } else {
      detail = preview;
    }
    if (detail !== preview) row.append(detail);
    input.addEventListener('change', () => {
      selectAdditionalNotice(drafts[mode], id, input.checked);
      updateNotes();
    });
    choices.push({ option, input, detail, editor, preview, help });
    $(group === 'common' ? '#commonNoticeChoices' : '#otherNoticeChoices').append(row);
  }
}

function renderNoteChoices() {
  const categories = new Map();
  for (const example of savedExamples) {
    const category = example.category || '登録した文例';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(example);
  }
  const list = $('#noteChoices');
  list.replaceChildren();
  for (const [category, examples] of categories) {
    const group = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = category;
    group.className = 'note-category';
    group.append(heading);
    for (const example of examples) {
      const line = document.createElement('div');
      line.className = 'example-row';
      const label = document.createElement('label');
      label.className = 'choice-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = example.id;
      checkbox.dataset.noteExample = '';
      const selected = drafts[mode].additionalNotes.find(note => note.exampleId === example.id);
      checkbox.checked = !!selected?.enabled;
      const text = document.createElement('span');
      text.textContent = example.text;
      label.append(checkbox, text);
      line.append(label);
      if (example.id.startsWith('custom-')) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button';
        remove.textContent = '登録解除';
        remove.setAttribute('aria-label', `文例の登録解除「${example.text}」`);
        remove.addEventListener('click', () => {
          savedExamples.splice(savedExamples.indexOf(example), 1);
          for (const draft of Object.values(drafts)) {
            for (const note of draft.additionalNotes) {
              if (note.exampleId === example.id) delete note.exampleId;
            }
          }
          renderNoteChoices();
          $('#addNoteButton').focus();
          showNoteStatus('文例の登録を解除しました。入力中の案内には残ります。');
          updateNotes();
        });
        line.append(remove);
      }
      checkbox.addEventListener('change', () => {
        const notes = drafts[mode].additionalNotes;
        const note = notes.find(item => item.exampleId === example.id);
        if (note) note.enabled = checkbox.checked;
        else notes.push({ exampleId: example.id, text: example.text, enabled: true });
        renderNoteEditors();
        updateNotes();
      });
      group.append(line);
    }
    list.append(group);
  }
}

function renderNoteEditors() {
  const list = $('#noteEditors');
  const template = $('#noteEditorTemplate');
  const notes = drafts[mode].additionalNotes;
  list.replaceChildren(...notes.map((note, index) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const label = `注意書き${index + 1}`;
    const include = row.querySelector('[data-include-note]');
    const editor = row.querySelector('[data-note-text]');
    const remove = row.querySelector('[data-delete-note]');
    const register = row.querySelector('[data-save-example]');
    include.nextElementSibling.textContent = `${label}を載せる`;
    include.checked = note.enabled;
    editor.value = note.text;
    editor.id = `free-note-${index}`;
    editor.setAttribute('aria-label', label);
    remove.setAttribute('aria-label', `${label}を削除`);
    register.setAttribute('aria-label', `${label}を文例に登録`);
    register.disabled = !note.text.trim();
    register.addEventListener('click', () => {
      const text = note.text.trim();
      if (!text) return;
      if ([...additionalOptions, ...savedExamples].some(example => example.text === text)) {
        showNoteStatus('同じ文例がすでにあります。');
        return;
      }
      const example = { id: 'custom-' + crypto.randomUUID(), text };
      savedExamples.push(example);
      note.exampleId = example.id;
      renderNoteChoices();
      saveDrafts();
      showNoteStatus('このブラウザに文例を登録しました。');
    });
    include.addEventListener('change', () => {
      note.enabled = include.checked;
      updateNotes();
    });
    editor.addEventListener('input', () => {
      note.text = editor.value;
      register.disabled = !note.text.trim();
      updateNotes();
    });
    for (const button of row.querySelectorAll('[data-move-note]')) {
      const next = index + Number(button.dataset.moveNote);
      button.disabled = next < 0 || next >= notes.length;
      button.setAttribute('aria-label', `${label}を${button.textContent}移動`);
      button.addEventListener('click', () => {
        [notes[index], notes[next]] = [notes[next], notes[index]];
        renderNoteEditors();
        const movedRow = list.children[next];
        const sameButton = movedRow.querySelector(`[data-move-note="${button.dataset.moveNote}"]`);
        (sameButton.disabled ? movedRow.querySelector('[data-note-text]') : sameButton).focus();
        updateNotes();
      });
    }
    remove.addEventListener('click', () => {
      notes.splice(index, 1);
      renderNoteEditors();
      const next = list.children[Math.min(index, notes.length - 1)];
      (next?.querySelector('[data-note-text]') || $('#addNoteButton')).focus();
      updateNotes();
    });
    return row;
  }));
}

function render() {
  const draft = drafts[mode];
  const payload = noticePayload(mode, draft);
  const values = payload.values;
  const short = mode === 'short';
  const paper = $('#paper');
  updateNoticeChoices(draft, payload);
  paper.classList.toggle('short', short);
  paper.classList.toggle('long', !short);
  paper.classList.toggle('full-end', payload.fullEnd);
  paper.classList.toggle('date-compact', payload.compactStart);
  paper.classList.toggle('compact-schedule', payload.compactSchedule);
  putText('vIssue', values.issue);
  putText('vRecipient', values.recipient);
  $('#vRecipient').hidden = !values.recipient;
  putText('vIssuer', values.issuer);
  putText('vTitle', values.title);
  renderIntro(short, payload);
  putText('vClosure', values.closure);
  putText('vMainDate', short ? values.mainDate : values.startLine);
  putText('vTimeRange', short ? values.timeRange : values.endLine);
  putText('vWorkLabel', short ? values.locationLabel : '【作業内容】');
  putText('vWorkPlace', short ? values.location : values.workDescription);
  putText('vContact', values.contact);
  $('#vIntroDate').hidden = !short;
  $('#vWorkSection').hidden = short && !values.location;
  $('#legacyResume').hidden = !draft.legacyResumeText;
  $('#legacyVehicleNotes').hidden = !draft.legacyVehicleNotes;
  putText('legacyResume', draft.legacyResumeText
    ? `以前の再開予定（参考）「${draft.legacyResumeText}」。新しい再開欄で指定してください。`
    : '');
  putText('legacyVehicleNotes', draft.legacyVehicleNotes
    ? `以前の車両に関する文面（参考）「${draft.legacyVehicleNotes}」。新しい車両の扱いと照合してください。`
    : '');
  renderNotes(payload);

  const errors = validate(mode, draft);
  const manualTitle = draft.titleMode === 'manual';
  titleInput.readOnly = !manualTitle;
  titleInput.required = manualTitle;
  if (!manualTitle) titleInput.value = noticeTitle(draft);
  putText('titleModeButton', manualTitle ? '自動生成に戻す' : 'タイトルを手動で編集');
  const titleError = errors.has('title');
  putText('titleDetailStatus', titleError ? '要入力' : manualTitle ? '手動' : '自動');
  $('#titleDetailStatus').classList.toggle('needs-attention', titleError);
  for (const input of ruleInputs) {
    const error = errors.get(input.name);
    const errorId = `${input.name}Error`;
    document.getElementById(errorId).hidden = !error;
    putText(errorId, error || '');
    input.setAttribute('aria-invalid', String(!!error));
    if (error) input.setAttribute('aria-describedby', errorId);
    else input.removeAttribute('aria-describedby');
  }
  const conflicts = noticeWarnings(payload);
  const summaries = [
    ['otherNoticeStatus', choices.filter(({ option, input }) => option.group === 'other' && input.checked).length,
      '選択中', conflicts.some(({ note }) => choices.some(({ option }) => option.id === note.optionId && option.group === 'other'))],
    ['freeNoticeStatus', payload.notes.filter(note => Number.isInteger(note.freeIndex)).length,
      '掲載', conflicts.some(({ note }) => Number.isInteger(note.freeIndex))],
  ];
  for (const [id, count, label, warning] of summaries) {
    putText(id, [count ? `${count}件${label}` : '', warning ? '要確認' : ''].filter(Boolean).join('・'));
    $('#' + id).classList.toggle('needs-attention', warning);
  }
  textWarnings = [
    ...[...errors].map(([field, message]) => ({ field, message })),
    ...conflictItems(conflicts),
    ...layoutWarnings(mode, draft, payload).map(message => ({ message })),
  ];
  renderFieldErrors(errors);
  updateButtons(errors.size > 0);
  scheduleScale();
}

function renderFieldErrors(errors) {
  $$('[data-field]').forEach(input => {
    const message = inputMode(input) === mode ? errors.get(input.dataset.field) : '';
    const time = input.closest('.time-entry');
    const anchor = time || input;
    const controls = time ? [input, timeEditor(input)] : [input];
    let hint = anchor.nextElementSibling;
    if (message) {
      if (!hint?.classList.contains('field-error')) {
        hint = document.createElement('span');
        hint.className = 'field-error';
        hint.id = `error-${input.dataset.field}`;
        anchor.after(hint);
      }
      hint.textContent = message;
      for (const control of controls) {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', hint.id);
      }
    } else if (hint?.classList.contains('field-error')) {
      hint.remove();
      for (const control of controls) {
        control.removeAttribute('aria-invalid');
        control.removeAttribute('aria-describedby');
      }
    }
  });
}

function updateButtons(invalid = validate(mode, drafts[mode]).size > 0) {
  $('#wordButton').disabled = invalid || exporting;
  $('#wordButton').textContent = exporting ? 'Wordを作成中…' : 'Word出力 (.docx)';
  $('#pdfButton').disabled = invalid || exporting;
}

function scheduleScale() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(scalePreview);
}

function scalePreview() {
  if (printMedia.matches) return;

  const paper = $('#paper');
  const scroller = $('#paperScroller');
  const holder = $('#paperHolder');
  const width = paper.offsetWidth;
  const height = paper.offsetHeight;
  paper.classList.toggle('overflow', previewOverflows());
  const scale = Math.min(1, scroller.clientWidth / width);
  holder.style.width = `${width * scale}px`;
  holder.style.height = `${height * scale}px`;
  paper.style.transform = `scale(${scale})`;

  const warnings = previewWarnings(textWarnings);
  const box = $('#warningBox');
  box.hidden = warnings.length === 0;
  const signature = JSON.stringify(warnings);
  if (box.dataset.signature !== signature) {
    box.dataset.signature = signature;
    box.replaceChildren(...warningItems(warnings));
  }
  putText('previewStatus', warnings.length ? `${warnings.length}件の確認項目` : '入力内容を確認できます');
}

function previewOverflows() {
  const { offsetHeight: height, offsetWidth: width } = $('#paper');
  return height > Math.round(width * 297 / 210);
}

function previewWarnings(messages) {
  const warnings = [...messages];
  if (previewOverflows()) {
    warnings.push({ message: 'A4の1ページを超えています。印刷とWordで改ページを確認してください。' });
  }
  return warnings;
}

function listItems(items) {
  return items.map(item => {
    const line = document.createElement('li');
    line.textContent = item;
    return line;
  });
}

function conflictItems(conflicts) {
  return conflicts.map(({ note, message }) => {
    if (Number.isInteger(note.freeIndex)) {
      return { target: `free-note-${note.freeIndex}`, message: `注意書き${note.freeIndex + 1}の確認。 ${message}` };
    }
    const option = additionalOptions.find(({ id }) => id === note.optionId);
    return { target: `preset-text-${option.id}`, message: `「${option.label}」の確認。 ${message}` };
  });
}

function focusInput(input) {
  for (let node = input?.parentElement; node; node = node.parentElement) {
    if (node.tagName === 'DETAILS') node.open = true;
  }
  if (input?.hasAttribute('data-time-select') && !timeEditor(input).hidden) input = timeEditor(input);
  input?.focus();
}

function warningItems(items) {
  return items.map(({ field, target, message }) => {
    const row = document.createElement('li');
    row.textContent = message;
    if (field || target) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'warning-link';
      button.textContent = '入力欄へ';
      button.setAttribute('aria-label', `${message} 入力欄へ`);
      button.addEventListener('click', () => {
        if ($('#distributionDialog').open) closeDistributionReview();
        const input = target ? document.getElementById(target) :
          $$('[data-field]').find(node => node.dataset.field === field && inputMode(node) === mode) ||
          ruleInputs.find(node => node.name === field);
        focusInput(input);
      });
      row.append(' ', button);
    }
    return row;
  });
}

function openDistributionReview(format) {
  const draft = drafts[mode];
  if (exporting || validate(mode, draft).size) return;
  const dialog = $('#distributionDialog');
  if (dialog.open) return;

  const payload = noticePayload(mode, draft);
  const { vehicle, deadline, restriction, resume } = payload.vehicleSummary;
  putText('reviewModeProperty', `${modes[mode]}・${draft.propertyName.trim()}`);
  putText('reviewSchedule', payload.workSchedule);
  putText('reviewVehicle', vehicle);
  putText('reviewDeadline', deadline);
  putText('reviewRestriction', restriction);
  putText('reviewResume', resume);
  const notes = payload.notes.filter(note => note.additional).map(note => note.text);
  $('#reviewNotes').replaceChildren(...listItems(notes));
  $('#reviewNotesRow').hidden = notes.length === 0;
  putText('reviewContact', payload.values.contact);
  putText('reviewConfirmButton', format === 'word' ? '確認してWordを出力' : '確認して印刷画面を開く');

  const warnings = previewWarnings([
    ...conflictItems(noticeWarnings(payload)),
    ...layoutWarnings(mode, draft, payload).map(message => ({ message })),
  ]);
  const list = $('#reviewWarnings');
  list.replaceChildren(...warningItems(warnings));
  list.hidden = warnings.length === 0;

  pendingReview = { format, kind: mode, payload, filename: wordFilename(draft), draft: JSON.stringify(draft) };
  dialog.showModal();
  $('#reviewBackButton').focus();
}

function closeDistributionReview() {
  pendingReview = null;
  $('#distributionDialog').close();
}

function confirmDistribution() {
  const confirmed = pendingReview;
  if (!confirmed || !$('#distributionDialog').open) return;
  closeDistributionReview();
  if (mode !== confirmed.kind || JSON.stringify(drafts[mode]) !== confirmed.draft) {
    showExportStatus('入力内容が変更されました。もう一度、配布前の内容を確認してください。', true);
    return;
  }
  if (confirmed.format === 'word') {
    void downloadWord(confirmed);
  } else {
    $('#paper').classList.toggle('overflow', previewOverflows());
    window.print();
  }
}

async function downloadWord({ kind, payload, filename }) {
  exporting = true;
  updateButtons();
  showExportStatus();
  try {
    const template = await loadWordTemplate(kind);
    downloadFile(createWord(template, payload), filename);
    showExportStatus(`${modes[kind]}のWordを作成しました。`);
  } catch {
    showExportStatus('Wordを作成できませんでした。ページを再読み込みして、配布サイトまたはローカルサーバーから開き直してください。', true);
  } finally {
    exporting = false;
    updateButtons();
  }
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function showCaseStatus(message = '') {
  $('#caseStatus').hidden = !message;
  putText('caseStatus', message);
}

function saveCase() {
  const { text, filename } = exportCase(mode, drafts[mode]);
  const file = new Blob([text], { type: 'application/json' });
  if (file.size > maxCaseBytes) {
    showCaseStatus('案件データが大きすぎます。自由入力などを短くしてから保存してください。');
    return;
  }
  downloadFile(file, filename);
  showCaseStatus('入力中の案件をJSONファイルに保存しました。');
}

async function readCase(file) {
  const request = ++caseRead;
  showCaseStatus();
  if (file.size > maxCaseBytes) {
    showCaseStatus('1 MB以下の案件ファイルを選択してください。');
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    if (request === caseRead) showCaseStatus('ファイルを読み込めませんでした。');
    return;
  }
  if (request !== caseRead) return;
  try {
    pendingCase = importCase(text);
  } catch (error) {
    showCaseStatus(error.message);
    return;
  }
  const { mode: target, draft } = pendingCase;
  const previousName = drafts[target].propertyName.trim();
  putText('caseDescription', `読み込むと、${modes[target]}の現在の入力${previousName ? `「${previousName}」` : ''}が置き換わります。`);
  putText('caseMode', modes[target]);
  putText('caseProperty', draft.propertyName || '未入力');
  putText('caseWork', draft.workDescription || '未入力');
  putText('caseNoticeTitle', noticeTitle(draft) || '未入力');
  $('#caseDialog').showModal();
}

function finishCase(confirmed) {
  const next = pendingCase;
  pendingCase = null;
  $('#caseDialog').close();
  if (!confirmed || !next) return;
  mode = next.mode;
  replaceDraft(next.draft);
  showCaseStatus(`${modes[mode]}の案件を読み込みました。`);
}

function replaceDraft(next) {
  drafts[mode] = next;
  linked = false;
  showExportStatus();
  showModeStatus();
  updateForm();
  saveDrafts();
}

function updateDraftField(input, value) {
  drafts[inputMode(input)][input.dataset.field] = value;
  if (!exporting) showExportStatus();
  render();
  saveDrafts();
}

function initTimeField(select) {
  select.add(new Option('時刻を入力', 'custom'));
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of ['00', '30']) {
      const time = `${String(hour).padStart(2, '0')}:${minute}`;
      select.add(new Option(time, time));
    }
  }
  const editor = timeEditor(select);
  select.addEventListener('change', () => {
    const custom = select.value === 'custom';
    editor.hidden = !custom;
    if (custom) {
      editor.value = drafts[inputMode(select)][select.dataset.field];
      editor.focus();
      editor.select();
    } else {
      updateDraftField(select, select.value);
    }
  });
  editor.addEventListener('input', () => updateDraftField(select, normalizeTimeInput(editor.value)));
}

function init() {
  $('#editorForm').addEventListener('submit', event => event.preventDefault());
  $$('[data-field]').forEach(input => {
    if (input.hasAttribute('data-time-select')) initTimeField(input);
    else input.addEventListener('input', () => updateDraftField(input, input.value));
  });
  for (const input of ruleInputs) input.addEventListener('change', () => {
    if (!input.checked) return;
    const draft = drafts[mode];
    draft[input.name] = input.value;
    if (!canSelectNotice(draft, 'spaces')) selectAdditionalNotice(draft, 'spaces', false);
    updateNotes();
  });
  initNoticeChoices();
  $('#titleModeButton').onclick = () => {
    const draft = drafts[mode];
    if (draft.titleMode === 'manual') {
      draft.titleMode = 'auto';
    } else {
      const title = noticeTitle(draft);
      draft.titleMode = 'manual';
      titleInput.value = draft.title ||= title;
    }
    render();
    saveDrafts();
    if (!titleInput.readOnly) titleInput.focus();
  };
  $('#addNoteButton').onclick = () => {
    drafts[mode].additionalNotes.push({ text: '', enabled: true });
    renderNoteEditors();
    $('#noteEditors').lastElementChild.querySelector('[data-note-text]').focus();
    updateNotes();
  };
  $('#shortButton').onclick = () => setMode('short');
  $('#longButton').onclick = () => setMode('long');
  $('#switchCarryButton').onclick = () => finishDraftSwitch('carry');
  $('#switchSavedButton').onclick = () => finishDraftSwitch('saved');
  $('#switchCancelButton').onclick = () => finishDraftSwitch('cancel');
  $('#draftSwitchDialog').addEventListener('cancel', () => { pendingMode = ''; });
  $('#sampleButton').onclick = () => {
    if (!hasDraftInput(mode, drafts[mode]) || confirm(`現在の${modes[mode]}の入力を架空のサンプルに置き換えますか？`)) {
      replaceDraft(sampleDraft(mode));
    }
  };
  $('#clearButton').onclick = () => {
    if (confirm(`現在の${modes[mode]}の入力を初期化しますか？施工会社・連絡先は引き継ぎます。`)) {
      const next = createDraft(mode);
      for (const key of contactFields) next[key] = drafts[mode][key];
      replaceDraft(next);
    }
  };
  $('#saveCaseButton').onclick = saveCase;
  const fileInput = $('#caseFile');
  $('#loadCaseButton').onclick = () => fileInput.click();
  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    if (file) void readCase(file);
  });
  $('#cancelCaseButton').onclick = () => finishCase(false);
  $('#confirmCaseButton').onclick = () => finishCase(true);
  $('#caseDialog').addEventListener('cancel', () => { pendingCase = null; });
  $('#pdfButton').onclick = () => openDistributionReview('print');
  $('#wordButton').onclick = () => openDistributionReview('word');
  $('#reviewBackButton').onclick = closeDistributionReview;
  $('#reviewConfirmButton').onclick = confirmDistribution;
  $('#distributionDialog').addEventListener('cancel', () => { pendingReview = null; });
  const observer = new ResizeObserver(scheduleScale);
  observer.observe($('#paper'));
  observer.observe($('#paperScroller'));
  window.addEventListener('afterprint', scheduleScale);
  updateForm();
}

init();
