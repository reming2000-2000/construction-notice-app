/* Static browser app. The preview, browser print and Word share one notice payload. */
import {
  createDraft, restoreDrafts, sampleDraft, validate, noticePayload,
  layoutWarnings, wordFilename,
} from './notice.js';
import { loadWordTemplate, createWord } from './word.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const storageKey = 'parkingNoticeDrafts';
const modes = { short: '短期工事', long: '長期工事' };
let mode = 'short';
let exporting = false;
let pendingReview = null;
let layoutFrame;
let textWarnings = [];

function putText(id, text) {
  const node = document.getElementById(id);
  if (node.textContent !== text) node.textContent = text;
}

function storageWarning() {
  const status = $('#storageStatus');
  status.hidden = false;
  status.textContent = 'このブラウザでは下書きを保存できません。ページを閉じる前に必要な案内文を保存してください。';
}

function loadDrafts() {
  try {
    return restoreDrafts(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    storageWarning();
    return restoreDrafts(null);
  }
}

const drafts = loadDrafts();

function saveDrafts() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(drafts));
    $('#storageStatus').hidden = true;
  } catch {
    storageWarning();
  }
}

function inputMode(input) {
  return input.closest('[data-modeonly]')?.dataset.modeonly ?? mode;
}

function updateForm() {
  $$('[data-modeonly]').forEach(node => { node.hidden = node.dataset.modeonly !== mode; });
  $$('[data-field]').forEach(input => {
    input.value = drafts[inputMode(input)][input.dataset.field] ?? '';
  });
  $$('[data-noteenabled]').forEach(input => {
    input.checked = drafts.long.noteEnabled[input.dataset.noteenabled];
  });
  for (const key of Object.keys(modes)) {
    const button = $(`#${key}Button`);
    button.classList.toggle('active', mode === key);
    button.setAttribute('aria-pressed', String(mode === key));
  }
  render();
}

function updateVehicleFields(draft) {
  const stopped = draft.vehicleMode === 'stay' || draft.vehicleMode === 'leave';
  const continuous = draft.restrictionMode === 'continuous';
  const daily = draft.restrictionMode === 'daily';
  $('#restrictionDailyOption').disabled = mode !== 'long';
  $('#restrictionDailyOption').hidden = mode !== 'long';
  $('#deadlineFields').hidden = draft.vehicleMode !== 'leave';
  $('#restrictionSettings').hidden = !stopped;
  $('#restrictionTimeFields').hidden = !continuous && !daily;
  $$('.restriction-date-field').forEach(field => { field.hidden = !continuous; });
  $('#dailyRestrictionHelp').hidden = !daily;
  $('#resumeSettings').hidden = !stopped;
  $('#resumeCustomFields').hidden = draft.resumeMode !== 'custom';
}

function showExportStatus(message = '', error = false) {
  const status = $('#exportStatus');
  status.hidden = !message;
  status.classList.toggle('error', error);
  putText('exportStatus', message);
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  if (!exporting) showExportStatus();
  updateForm();
}

function renderNotes(payload) {
  const list = $('#vNotes');
  list.replaceChildren();
  for (const note of payload.notes) {
    const row = document.createElement('div');
    row.className = 'notice-line';
    row.classList.toggle('red', note.red);
    row.classList.toggle('secondary-note', note.secondary);
    row.dataset.notepreview = note.key;
    row.dataset.gap = note.gapAfter;

    const body = document.createElement('div');
    body.className = 'notice-body';
    if (!note.secondary) {
      const diamond = document.createElement('span');
      diamond.className = 'diamond';
      diamond.textContent = '◆';
      diamond.setAttribute('aria-hidden', 'true');
      body.append(diamond);
    }
    const text = document.createElement('span');
    text.className = 'note-text';
    text.textContent = note.text;
    body.append(text);
    row.append(body);
    if (note.detail) {
      const detail = document.createElement('div');
      detail.className = 'note-detail';
      detail.textContent = note.detail;
      row.append(detail);
    }
    list.append(row);
  }
  putText('vNotesHeading', payload.values.notesHeading);
  $('#vNotesSection').hidden = !payload.notes.length;
}

function render() {
  const draft = drafts[mode];
  const payload = noticePayload(mode, draft);
  const values = payload.values;
  const short = mode === 'short';
  const paper = $('#paper');
  updateVehicleFields(draft);
  paper.className = `paper ${mode}`;
  paper.classList.toggle('full-end', payload.fullEnd);
  paper.classList.toggle('date-compact', payload.compactStart);
  putText('vIssue', values.issue);
  putText('vRecipient', values.recipient);
  putText('vIssuer', values.issuer);
  putText('vTitle', values.title);
  putText('vIntro', values.intro);
  putText('vIntroDate', values.introDate || '');
  putText('vClosure', values.closure);
  putText('vMainDate', short ? values.mainDate : values.startLine);
  putText('vTimeRange', short ? values.timeRange : values.endLine);
  putText('vResume', values.resume || '');
  putText('vWorkLabel', short ? values.locationLabel : '【作業内容】');
  putText('vWorkPlace', short ? values.location : values.workDescription);
  putText('vContact', values.contact);
  $('#vResumeLine').hidden = short || !values.resume;
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
  textWarnings = [...errors.values(), ...layoutWarnings(mode, draft, payload)];
  renderFieldErrors(errors);
  updateButtons(errors.size > 0);
  scheduleScale();
}

function renderFieldErrors(errors) {
  $$('[data-field]').forEach(input => {
    const message = inputMode(input) === mode ? errors.get(input.dataset.field) : '';
    let hint = input.nextElementSibling;
    if (message) {
      if (!hint?.classList.contains('field-error')) {
        hint = document.createElement('span');
        hint.className = 'field-error';
        hint.id = `error-${input.dataset.field}`;
        input.after(hint);
      }
      hint.textContent = message;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', hint.id);
    } else if (hint?.classList.contains('field-error')) {
      hint.remove();
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
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
  const paper = $('#paper');
  const scroller = $('#paperScroller');
  const holder = $('#paperHolder');
  const width = paper.offsetWidth;
  const height = paper.offsetHeight;
  const scale = Math.min(1, scroller.clientWidth / width);
  holder.style.width = `${width * scale}px`;
  holder.style.height = `${height * scale}px`;
  paper.style.transform = `scale(${scale})`;

  const warnings = previewWarnings(textWarnings);
  const box = $('#warningBox');
  box.hidden = warnings.length === 0;
  if ([...box.children].map(item => item.textContent).join('\n') !== warnings.join('\n')) {
    box.replaceChildren(...warningItems(warnings));
  }
  putText('previewStatus', warnings.length ? `${warnings.length}件の確認項目` : '入力内容を確認できます');
}

function previewWarnings(messages) {
  const paper = $('#paper');
  const { offsetHeight: height, offsetWidth: width } = paper;
  const warnings = [...messages];
  if (height > width * 297 / 210 + 2) {
    warnings.push('A4の1ページを超えています。印刷とWordで改ページを確認してください。');
  }
  return warnings;
}

function warningItems(warnings) {
  return warnings.map(warning => {
    const line = document.createElement('li');
    line.textContent = warning;
    return line;
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
  putText('reviewContact', payload.values.contact);
  putText('reviewConfirmButton', format === 'word' ? '確認してWordを出力' : '確認して印刷画面を開く');

  const warnings = previewWarnings(layoutWarnings(mode, draft, payload));
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
    window.print();
  }
}

async function downloadWord({ kind, payload, filename }) {
  exporting = true;
  updateButtons();
  showExportStatus();
  try {
    const template = await loadWordTemplate(kind);
    const blob = createWord(template, payload);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    showExportStatus(`${modes[kind]}のWordを作成しました。`);
  } catch {
    showExportStatus('Wordを作成できませんでした。ページを再読み込みして、配布サイトまたはローカルサーバーから開き直してください。', true);
  } finally {
    exporting = false;
    updateButtons();
  }
}

function replaceDraft(next) {
  drafts[mode] = next;
  showExportStatus();
  updateForm();
  saveDrafts();
}

function init() {
  $('#editorForm').addEventListener('submit', event => event.preventDefault());
  $$('[data-field]').forEach(input => input.addEventListener('input', () => {
    const draft = drafts[inputMode(input)];
    const key = input.dataset.field;
    draft[key] = input.value;
    if (!exporting) showExportStatus();
    render();
    saveDrafts();
  }));
  $$('[data-noteenabled]').forEach(input => input.addEventListener('change', () => {
    drafts.long.noteEnabled[input.dataset.noteenabled] = input.checked;
    if (!exporting) showExportStatus();
    render();
    saveDrafts();
  }));
  $('#shortButton').onclick = () => setMode('short');
  $('#longButton').onclick = () => setMode('long');
  $('#sampleButton').onclick = () => {
    const unchanged = JSON.stringify(drafts[mode]) === JSON.stringify(createDraft(mode));
    if (unchanged || confirm(`現在の${modes[mode]}の入力を架空のサンプルに置き換えますか？`)) {
      replaceDraft(sampleDraft(mode));
    }
  };
  $('#clearButton').onclick = () => {
    if (confirm(`現在の${modes[mode]}の入力を初期化しますか？`)) replaceDraft(createDraft(mode));
  };
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
