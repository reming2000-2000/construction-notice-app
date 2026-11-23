const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const V = 'urn:schemas-microsoft-com:vml';
const WPS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML = 'http://www.w3.org/XML/1998/namespace';
const FRAME_REL_ID = 'rIdScheduleFrame';
const FRAME_TARGET = 'media/schedule-frame.png';
const EMU_PER_POINT = 12_700;
const EMU_PER_MM = 36_000;
const TEMPLATE_LINE_TWIPS = 358;
const NOTICE_FONT = 'Meiryo';
const MODEL_VERSION = 2;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const templates = new Map();

export async function loadWordTemplate(mode) {
  if (!templates.has(mode)) {
    const url = new URL(`./templates/template-${mode}.json`, import.meta.url);
    const response = await fetch(url, {
      mode: 'same-origin',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error('テンプレートを読み込めませんでした。');
    const template = await response.json();
    if (template.formatVersion !== MODEL_VERSION || template.mode !== mode ||
        typeof template.documentXml !== 'string' || !template.entries) {
      throw new Error('テンプレートの形式が一致しません。');
    }
    templates.set(mode, template);
  }
  return templates.get(mode);
}

function adjustImportantStamp(document) {
  const stamp = document.getElementsByTagNameNS(MC, 'AlternateContent')[0];
  const anchor = stamp.getElementsByTagNameNS(WP, 'anchor')[0];
  const offset = direction => anchor.getElementsByTagNameNS(WP, 'position' + direction)[0]
    .getElementsByTagNameNS(WP, 'posOffset')[0];
  const left = Number(offset('H').textContent) - 4 * EMU_PER_MM;
  const top = Number(offset('V').textContent) - 2.5 * EMU_PER_MM;
  offset('H').textContent = String(left);
  offset('V').textContent = String(top);

  // Match the anchor to the red shape's bounds and reserve half its stroke on each side.
  const extent = anchor.getElementsByTagNameNS(WP, 'extent')[0];
  const width = Number(extent.getAttribute('cx'));
  const height = Number(extent.getAttribute('cy'));
  const transformExtent = stamp.getElementsByTagNameNS(A, 'ext')[0];
  transformExtent.setAttribute('cx', width);
  transformExtent.setAttribute('cy', height);
  const line = stamp.getElementsByTagNameNS(A, 'ln')[0];
  const stroke = Number(line.getAttribute('w'));
  const effect = anchor.getElementsByTagNameNS(WP, 'effectExtent')[0];
  for (const side of ['l', 't', 'r', 'b']) effect.setAttribute(side, String(Math.ceil(stroke / 2)));

  // Keep the native text box and synchronize the VML fallback with the DrawingML shape.
  const fallback = stamp.getElementsByTagNameNS(V, 'roundrect')[0];
  const points = value => (value / EMU_PER_POINT).toFixed(3) + 'pt';
  fallback.setAttribute('style', fallback.getAttribute('style')
    .replace(/margin-left:[^;]+/, `margin-left:${points(left)}`)
    .replace(/margin-top:[^;]+/, `margin-top:${points(top)}`)
    .replace(/width:[^;]+/, `width:${points(width)}`)
    .replace(/height:[^;]+/, `height:${points(height)}`)
    .replace('mso-wrap-style:square', 'mso-wrap-style:none')
    .replace('v-text-anchor:top', 'v-text-anchor:middle'));
  fallback.setAttribute('strokecolor', '#' + line.getElementsByTagNameNS(A, 'srgbClr')[0].getAttribute('val'));
  fallback.setAttribute('strokeweight', points(stroke));
  fallback.setAttribute('filled', 'f');
  fallback.getElementsByTagNameNS(V, 'stroke')[0].setAttribute('weight', points(stroke));
  stamp.getElementsByTagNameNS(WPS, 'bodyPr')[0].setAttribute('anchor', 'ctr');
  for (const box of stamp.getElementsByTagNameNS(W, 'txbxContent')) {
    // Balance the visible glyphs inside the centered, fixed-height text line.
    box.getElementsByTagNameNS(W, 'spacing')[0].setAttributeNS(W, 'w:before', '120');
  }
}

function setScheduleFrame(document, { mode, compactSchedule, extraOutlineLines }, heading) {
  const outline = document.getElementsByTagNameNS(MC, 'AlternateContent')[1];
  const drawing = outline.getElementsByTagNameNS(W, 'drawing')[0];
  const anchor = drawing.getElementsByTagNameNS(WP, 'anchor')[0];
  const anchorParagraph = outline.parentNode.parentNode;
  const extent = anchor.getElementsByTagNameNS(WP, 'extent')[0];
  const width = Number(extent.getAttribute('cx'));
  const originalHeight = Number(extent.getAttribute('cy'));
  const heightChange = compactSchedule ? -82 : (extraOutlineLines - (mode === 'long' ? 1 : 0)) * 17.9;
  const height = originalHeight + Math.round(heightChange * EMU_PER_POINT);
  const adjustment = Number(drawing.getElementsByTagNameNS(A, 'gd')[0].getAttribute('fmla').slice(4));
  const stroke = Number(drawing.getElementsByTagNameNS(A, 'ln')[0].getAttribute('w')) / EMU_PER_POINT;

  // A transparent picture avoids the separate DrawingML and VML shape renderers.
  // The editable paragraphs remain in front of the single uninterrupted border.
  anchor.setAttribute('behindDoc', '1');
  anchor.setAttribute('layoutInCell', '0');
  anchor.getElementsByTagNameNS(WP, 'effectExtent')[0].remove();
  extent.setAttribute('cy', height);
  anchor.getElementsByTagNameNS(WP, 'docPr')[0].setAttribute('name', '工事期間の囲み枠');
  const graphicData = drawing.getElementsByTagNameNS(A, 'graphicData')[0];
  graphicData.setAttribute('uri', PIC);
  graphicData.replaceChildren();
  const picture = appendElement(graphicData, PIC, 'pic:pic');
  const properties = appendElement(picture, PIC, 'pic:nvPicPr');
  appendElement(properties, PIC, 'pic:cNvPr', { id: '0', name: '工事期間の囲み枠' });
  appendElement(properties, PIC, 'pic:cNvPicPr');
  const fill = appendElement(picture, PIC, 'pic:blipFill');
  appendElement(fill, A, 'a:blip').setAttributeNS(OFFICE_REL, 'r:embed', FRAME_REL_ID);
  appendElement(appendElement(fill, A, 'a:stretch'), A, 'a:fillRect');
  const shape = appendElement(picture, PIC, 'pic:spPr');
  const transform = appendElement(shape, A, 'a:xfrm');
  appendElement(transform, A, 'a:off', { x: '0', y: '0' });
  appendElement(transform, A, 'a:ext', { cx: width, cy: height });
  appendElement(appendElement(shape, A, 'a:prstGeom', { prst: 'rect' }), A, 'a:avLst');
  outline.replaceWith(drawing);

  // The anchor and its two spacer paragraphs occupy the same space as one line.
  const before = anchorParagraph.previousElementSibling;
  const beforeHeight = lineHeight(before);
  const afterHeight = takeSpacerLines(anchorParagraph, heading);
  const offset = anchor.getElementsByTagNameNS(WP, 'positionV')[0].getElementsByTagNameNS(WP, 'posOffset')[0];
  offset.textContent = String(Number(offset.textContent) + beforeHeight * EMU_PER_POINT / 20);
  spacing(anchorParagraph).setAttributeNS(W, 'w:line', String(beforeHeight + lineHeight(anchorParagraph) + afterHeight));
  before.remove();
  const radiusHeight = mode === 'short' ? originalHeight : height;
  return {
    width: width / EMU_PER_POINT,
    height: height / EMU_PER_POINT,
    radius: Math.min(width, radiusHeight) * adjustment / (100_000 * EMU_PER_POINT),
    stroke,
  };
}

function drawScheduleFrame({ width, height, radius, stroke }) {
  const canvas = document.createElement('canvas');
  // 432 DPI at the template size. Limit canvas memory for oversized imported drafts.
  const scale = Math.min(6, 8192 / Math.max(width, height), Math.sqrt(8_000_000 / (width * height)));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.scale(canvas.width / width, canvas.height / height);
  context.lineWidth = stroke;
  context.beginPath();
  context.roundRect(stroke / 2, stroke / 2, width - stroke, height - stroke, radius);
  context.stroke();
  return base64Bytes(canvas.toDataURL('image/png').split(',')[1]);
}

function takeSpacerLines(first, last) {
  let height = 0;
  while (first.nextElementSibling && first.nextElementSibling !== last) {
    height += lineHeight(first.nextElementSibling);
    first.nextElementSibling.remove();
  }
  return height;
}

function spacing(paragraph) {
  return paragraph.firstElementChild.getElementsByTagNameNS(W, 'spacing')[0];
}

function lineHeight(paragraph) {
  return Number(spacing(paragraph)?.getAttributeNS(W, 'line')) || TEMPLATE_LINE_TWIPS;
}

function replaceSpacers(first, last) {
  const height = takeSpacerLines(first, last);
  const properties = spacing(last);
  const before = Number(properties.getAttributeNS(W, 'before'));
  if (height) properties.setAttributeNS(W, 'w:before', String(before + height));
}

function removeParagraphControl(paragraph, control) {
  paragraph.firstElementChild.getElementsByTagNameNS(W, control)[0]?.remove();
}

function appendElement(parent, namespace, name, attributes = {}) {
  const node = parent.ownerDocument.createElementNS(namespace, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}

function appendWord(parent, name, attributes = {}) {
  const node = parent.ownerDocument.createElementNS(W, 'w:' + name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttributeNS(W, 'w:' + key, value);
  }
  parent.append(node);
  return node;
}

function insertUnsplitTable(before, atBottom = false) {
  const body = before.parentNode;
  const section = body.lastElementChild;
  const margins = section.getElementsByTagNameNS(W, 'pgMar')[0];
  const pageWidth = section.getElementsByTagNameNS(W, 'pgSz')[0].getAttributeNS(W, 'w');
  const width = Number(pageWidth) - Number(margins.getAttributeNS(W, 'left')) -
    Number(margins.getAttributeNS(W, 'right'));

  const table = body.ownerDocument.createElementNS(W, 'w:tbl');
  before.before(table);
  const properties = appendWord(table, 'tblPr');
  if (atBottom) {
    appendWord(properties, 'tblpPr', {
      horzAnchor: 'margin', vertAnchor: 'margin', tblpX: '0', tblpYSpec: 'bottom', topFromText: '320',
    });
    appendWord(properties, 'tblOverlap', { val: 'never' });
  }
  appendWord(properties, 'tblW', { w: width, type: 'dxa' });
  appendWord(properties, 'tblLayout', { type: 'fixed' });
  const padding = appendWord(properties, 'tblCellMar');
  for (const side of ['top', 'left', 'bottom', 'right']) {
    appendWord(padding, side, { w: '0', type: 'dxa' });
  }
  appendWord(appendWord(table, 'tblGrid'), 'gridCol', { w: width });
  const row = appendWord(table, 'tr');
  appendWord(appendWord(row, 'trPr'), 'cantSplit');
  const cell = appendWord(row, 'tc');
  appendWord(appendWord(cell, 'tcPr'), 'tcW', { w: width, type: 'dxa' });
  return cell;
}

function keepScheduleTogether(anchor, end) {
  // The unsplit row keeps the picture and its editable text on the same page.
  const cell = insertUnsplitTable(anchor);
  for (let line = anchor; line !== end;) {
    const next = line.nextElementSibling;
    removeParagraphControl(line, 'keepLines');
    removeParagraphControl(line, 'keepNext');
    cell.append(line);
    line = next;
  }
}

function placeContactAtBottom(heading, contact) {
  const cell = insertUnsplitTable(heading, true);
  spacing(heading).setAttributeNS(W, 'w:before', '0');
  removeParagraphControl(heading, 'keepNext');
  cell.append(heading, contact);
}

function setRunText(field, value) {
  const [first, ...lines] = value.split('\n');
  field.setAttributeNS(XML, 'xml:space', 'preserve');
  field.textContent = first;
  let last = field;
  for (const line of lines) {
    const next = field.cloneNode(false);
    next.textContent = line;
    last.after(field.ownerDocument.createElementNS(W, 'w:br'), next);
    last = next;
  }
}

function setRunColor(run, color) {
  run.getElementsByTagNameNS(W, 'color')[0].setAttributeNS(W, 'w:val', color);
}

function setNoticeFont(paragraph) {
  for (const font of paragraph.getElementsByTagNameNS(W, 'rFonts')) {
    for (const theme of ['asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme']) {
      font.removeAttributeNS(W, theme);
    }
    for (const script of ['ascii', 'hAnsi', 'eastAsia', 'cs']) {
      font.setAttributeNS(W, 'w:' + script, NOTICE_FONT);
    }
  }
}

function setIntroRuns(field, parts) {
  const original = field.parentNode;
  for (const { text, red } of parts) {
    const run = original.cloneNode(true);
    if (red) {
      const color = run.getElementsByTagNameNS(W, 'color')[0];
      color.before(appendWord(run.firstElementChild, 'b'), appendWord(run.firstElementChild, 'bCs'));
    }
    setRunColor(run, red ? 'EE0000' : '000000');
    setRunText(run.getElementsByTagNameNS(W, 't')[0], text);
    original.before(run);
  }
  original.remove();
}

function fillDocument(templateXml, payload) {
  const document = new DOMParser().parseFromString(templateXml, 'application/xml');
  if (document.documentElement.namespaceURI !== W || document.documentElement.localName !== 'document' ||
      document.getElementsByTagName('parsererror').length) {
    throw new Error('テンプレートの XML が壊れています。');
  }

  const fields = new Map();
  for (const text of document.getElementsByTagNameNS(W, 't')) {
    const match = /^@@(\w+)@@$/.exec(text.textContent);
    if (match) fields.set(match[1], text);
  }
  const { values, mode, notes, compactStart, compactSchedule, introParts } = payload;
  if (fields.size !== Object.keys(values).length || [...fields.keys()].some(key => !Object.hasOwn(values, key))) {
    throw new Error('テンプレートの差し込み欄が一致しません。');
  }

  const paragraph = key => fields.get(key).parentNode.parentNode;
  const notesHeading = paragraph('notesHeading');
  const contactHeading = paragraph('contact').previousElementSibling;
  const extraNoteStyle = paragraph(mode === 'short' ? 'notice2Detail' : 'notice5').cloneNode(true);
  const scheduleHeading = paragraph(mode === 'short' ? 'mainDate' : 'startLine').previousElementSibling;
  const scheduleEnd = paragraph(mode === 'short' ? 'timeRange' : 'endLine');
  adjustImportantStamp(document);
  const frame = setScheduleFrame(document, payload, scheduleHeading);

  replaceSpacers(paragraph('issuer'), paragraph('title'));
  let introDate = fields.get('introDate');
  if (!introDate) {
    // The long template uses one placeholder for the entire introduction.
    // Copy its formatting before adding the template's title-to-greeting space.
    const greeting = paragraph('intro');
    const dateLine = greeting.cloneNode(false);
    const dateRun = fields.get('intro').parentNode.cloneNode(true);
    dateLine.append(greeting.firstElementChild.cloneNode(true), dateRun);
    greeting.after(dateLine);
    introDate = dateRun.getElementsByTagNameNS(W, 't')[0];
  }
  replaceSpacers(paragraph('title'), paragraph('intro'));

  const optional = ['recipient', 'issuer', 'notesHeading', ...Object.keys(values).filter(key => /^notice[1-6]$/.test(key))];
  optional.push(mode === 'short' ? 'notice2Detail' : 'resume');
  for (const key of optional) {
    if (!values[key]) paragraph(key).remove();
  }

  const afterSchedule = notesHeading.isConnected ? notesHeading : contactHeading;
  if (compactSchedule) {
    // The short form has no location block. Keep only the clearance below the frame.
    takeSpacerLines(scheduleEnd, afterSchedule);
    spacing(notesHeading).setAttributeNS(W, 'w:before', '880');
  } else {
    const work = paragraph(mode === 'short' ? 'location' : 'workDescription');
    replaceSpacers(scheduleEnd, work.previousElementSibling);
    if (notesHeading.isConnected) replaceSpacers(work, notesHeading);
    else takeSpacerLines(work, afterSchedule);
  }
  keepScheduleTogether(scheduleHeading.previousElementSibling, afterSchedule);
  spacing(notesHeading).setAttributeNS(W, 'w:after', '120');
  setNoticeFont(notesHeading);

  for (const [index, note] of notes.entries()) {
    const line = note.additional ? extraNoteStyle.cloneNode(true) : paragraph(note.key);
    const next = notes[index + 1];
    setNoticeFont(line);
    const lineSpacing = spacing(line);
    const props = line.firstElementChild;
    removeParagraphControl(line, 'keepLines');
    const indent = document.createElementNS(W, 'w:ind');
    // Keep the first line at the template margin and align continuations with the text.
    for (const attribute of ['left', 'hanging']) indent.setAttributeNS(W, 'w:' + attribute, note.additional ? '240' : '320');
    props.getElementsByTagNameNS(W, 'ind')[0]?.remove();
    lineSpacing.after(indent);
    lineSpacing.setAttributeNS(W, 'w:line', '320');
    if (next) lineSpacing.setAttributeNS(W, 'w:after', '80');
    for (const color of line.getElementsByTagNameNS(W, 'color')) {
      color.setAttributeNS(W, 'w:val', note.red ? 'EE0000' : '000000');
    }
    if (note.additional) {
      setRunText(line.getElementsByTagNameNS(W, 't')[0], `◆ ${note.text}`);
      contactHeading.before(line);
    }
  }
  if (mode === 'long') {
    // A paragraph inset also keeps any wrapped continuation aligned.
    const indent = key => paragraph(key).getElementsByTagNameNS(W, 'ind')[0];
    const left = indent('startLine').getAttributeNS(W, 'firstLine');
    for (const key of ['startLine', 'endLine']) {
      indent(key).removeAttributeNS(W, 'firstLine');
      indent(key).setAttributeNS(W, 'w:left', left);
    }
  }
  if (compactStart) {
    const runProperties = fields.get('startLine').parentNode.getElementsByTagNameNS(W, 'rPr')[0];
    const width = document.createElementNS(W, 'w:w');
    width.setAttributeNS(W, 'w:val', '92');
    runProperties.insertBefore(width, runProperties.getElementsByTagNameNS(W, 'sz')[0]);
  }
  setRunColor(fields.get('closure').parentNode, '000000');
  for (const [key, field] of fields) {
    if (field !== introDate) setRunText(field, values[key]);
  }
  setIntroRuns(introDate, introParts);
  placeContactAtBottom(contactHeading, paragraph('contact'));
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    new XMLSerializer().serializeToString(document.documentElement);
  return { xml, frame };
}

function base64Bytes(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// The prototype's store-only ZIP writer. No compression library or network
// service is needed for these small OOXML packages.
export function zipStore(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const u16 = (view, index, value) => view.setUint16(index, value, true);
  const u32 = (view, index, value) => view.setUint32(index, value, true);

  for (const [name, bytes] of entries) {
    const path = encoder.encode(name);
    const crc = crc32(bytes);
    const localHeader = new Uint8Array(30 + path.length);
    const lv = new DataView(localHeader.buffer);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20);
    u16(lv, 6, 0x0800);
    u16(lv, 12, 0x0021); // DOS date 1980-01-01
    u32(lv, 14, crc);
    u32(lv, 18, bytes.length);
    u32(lv, 22, bytes.length);
    u16(lv, 26, path.length);
    localHeader.set(path, 30);
    local.push(localHeader, bytes);

    const centralHeader = new Uint8Array(46 + path.length);
    const cv = new DataView(centralHeader.buffer);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u16(cv, 8, 0x0800);
    u16(cv, 14, 0x0021);
    u32(cv, 16, crc);
    u32(cv, 20, bytes.length);
    u32(cv, 24, bytes.length);
    u16(cv, 28, path.length);
    u32(cv, 42, offset);
    centralHeader.set(path, 46);
    central.push(centralHeader);
    offset += localHeader.length + bytes.length;
  }

  const centralSize = central.reduce((size, bytes) => size + bytes.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  u32(view, 0, 0x06054b50);
  u16(view, 8, entries.length);
  u16(view, 10, entries.length);
  u32(view, 12, centralSize);
  u32(view, 16, offset);
  return new Blob([...local, ...central, end], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function createWord(template, payload) {
  const { xml, frame } = fillDocument(template.documentXml, payload);
  const entries = new Map(Object.entries(template.entries).map(([name, encoded]) => [name, base64Bytes(encoded)]));
  const fontsPath = 'word/fontTable.xml';
  const fonts = new DOMParser().parseFromString(decoder.decode(entries.get(fontsPath)), 'application/xml');
  const noticeFont = appendWord(fonts.documentElement, 'font', { name: NOTICE_FONT });
  appendWord(noticeFont, 'altName', { val: 'Noto Sans CJK JP' });
  appendWord(noticeFont, 'charset', { val: '80' });
  appendWord(noticeFont, 'family', { val: 'swiss' });
  appendWord(noticeFont, 'pitch', { val: 'variable' });
  entries.set(fontsPath, encoder.encode(new XMLSerializer().serializeToString(fonts)));
  const relsPath = 'word/_rels/document.xml.rels';
  const rels = new DOMParser().parseFromString(decoder.decode(entries.get(relsPath)), 'application/xml');
  appendElement(rels.documentElement, PACKAGE_REL, 'Relationship', {
    Id: FRAME_REL_ID, Type: OFFICE_REL + '/image', Target: FRAME_TARGET,
  });
  entries.set(relsPath, encoder.encode(new XMLSerializer().serializeToString(rels)));
  entries.set('word/document.xml', encoder.encode(xml));
  entries.set('word/' + FRAME_TARGET, drawScheduleFrame(frame));
  return zipStore([...entries]);
}
