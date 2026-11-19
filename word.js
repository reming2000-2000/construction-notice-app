const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const VML = 'urn:schemas-microsoft-com:vml';
const XML = 'http://www.w3.org/XML/1998/namespace';
const MODEL_VERSION = 2;
const encoder = new TextEncoder();
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

function resizeOutline(document, extraLines) {
  // Adjust the same work frame in both the modern and legacy Word drawings.
  const outline = document.getElementsByTagNameNS(MC, 'AlternateContent')[1];
  const expansion = extraLines * 17.9;
  for (const [namespace, name] of [[WP, 'extent'], [A, 'ext']]) {
    const extent = outline.getElementsByTagNameNS(namespace, name)[0];
    const height = Number(extent.getAttribute('cy'));
    extent.setAttribute('cy', String(height + Math.round(expansion * 12_700)));
  }
  const rectangle = outline.getElementsByTagNameNS(VML, 'roundrect')[0];
  rectangle.setAttribute('style', rectangle.getAttribute('style')
    .replace(/height:([\d.]+)pt/, (_, height) => `height:${(Number(height) + expansion).toFixed(2)}pt`));
}

function removeBetween(first, last) {
  while (first.nextElementSibling && first.nextElementSibling !== last) {
    first.nextElementSibling.remove();
  }
}

function spacing(paragraph) {
  return paragraph.firstElementChild.getElementsByTagNameNS(W, 'spacing')[0];
}

function appendWord(parent, name, attributes = {}) {
  const node = parent.ownerDocument.createElementNS(W, 'w:' + name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttributeNS(W, 'w:' + key, value);
  }
  parent.append(node);
  return node;
}

function placeContactAtBottom(heading, contact) {
  const body = heading.parentNode;
  const section = body.lastElementChild;
  const margins = section.getElementsByTagNameNS(W, 'pgMar')[0];
  const pageWidth = section.getElementsByTagNameNS(W, 'pgSz')[0].getAttributeNS(W, 'w');
  const width = Number(pageWidth) - Number(margins.getAttributeNS(W, 'left')) -
    Number(margins.getAttributeNS(W, 'right'));

  // A single table follows the last note in document order. Native text wrapping
  // reserves its space and can move it to the next page when the page is full.
  const table = body.ownerDocument.createElementNS(W, 'w:tbl');
  heading.before(table);
  const properties = appendWord(table, 'tblPr');
  appendWord(properties, 'tblpPr', {
    horzAnchor: 'margin', vertAnchor: 'margin', tblpX: '0', tblpYSpec: 'bottom', topFromText: '320',
  });
  appendWord(properties, 'tblOverlap', { val: 'never' });
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
  spacing(heading).setAttributeNS(W, 'w:before', '0');
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

export function fillDocument(templateXml, payload) {
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
  const { values, mode, notes, fullEnd, compactStart, compactSchedule, extraOutlineLines } = payload;
  if (fields.size !== Object.keys(values).length || [...fields.keys()].some(key => !Object.hasOwn(values, key))) {
    throw new Error('テンプレートの差し込み欄が一致しません。');
  }

  const paragraph = key => fields.get(key).parentNode.parentNode;
  const notesHeading = paragraph('notesHeading');
  const contactHeading = paragraph('contact').previousElementSibling;
  const extraNoteStyle = paragraph(mode === 'short' ? 'notice2Detail' : 'notice5').cloneNode(true);

  if (compactSchedule) {
    const scheduleHeading = paragraph('mainDate').previousElementSibling;
    // Delete the old floating frame and the paragraphs reserved for its padding and work location.
    removeBetween(paragraph('closure').nextElementSibling, scheduleHeading);
    removeBetween(paragraph('timeRange'), notesHeading);
    spacing(scheduleHeading).setAttributeNS(W, 'w:before', '420');
    spacing(notesHeading).setAttributeNS(W, 'w:before', '280');
  } else if (mode === 'long') {
    // Reopening is explained with the vehicle rules, leaving one fewer line inside the frame.
    resizeOutline(document, extraOutlineLines - 1);
  }
  spacing(notesHeading).setAttributeNS(W, 'w:after', '120');

  const optional = ['recipient', 'notesHeading', ...Object.keys(values).filter(key => /^notice[1-6]$/.test(key))];
  optional.push(mode === 'short' ? 'notice2Detail' : 'resume');
  for (const key of optional) {
    if (!values[key]) paragraph(key).remove();
  }
  for (const [index, note] of notes.entries()) {
    const line = note.additional ? extraNoteStyle.cloneNode(true) : paragraph(note.key);
    const next = notes[index + 1];
    // Use the same CJK face as the preview for the new Japanese paragraphs.
    // The template's Meiryo fallback can drop glyphs around punctuation in Writer.
    for (const font of line.getElementsByTagNameNS(W, 'rFonts')) {
      for (const script of ['ascii', 'hAnsi', 'eastAsia', 'cs']) {
        font.setAttributeNS(W, 'w:' + script, 'Noto Sans CJK JP');
      }
    }
    const lineSpacing = spacing(line);
    const props = line.firstElementChild;
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
    } else if (next && !next.additional) {
      props.insertBefore(document.createElementNS(W, 'w:keepNext'), props.getElementsByTagNameNS(W, 'keepLines')[0]);
    }
  }
  if (fullEnd) {
    // A year change needs the full end date; use the start line's original indent.
    const indent = key => paragraph(key).getElementsByTagNameNS(W, 'ind')[0];
    indent('endLine').setAttributeNS(W, 'w:firstLine', indent('startLine').getAttributeNS(W, 'firstLine'));
  }
  if (compactStart) {
    const runProperties = fields.get('startLine').parentNode.getElementsByTagNameNS(W, 'rPr')[0];
    const width = document.createElementNS(W, 'w:w');
    width.setAttributeNS(W, 'w:val', '92');
    runProperties.insertBefore(width, runProperties.getElementsByTagNameNS(W, 'sz')[0]);
  }
  for (const [key, field] of fields) {
    setRunText(field, values[key]);
  }
  placeContactAtBottom(contactHeading, paragraph('contact'));
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    new XMLSerializer().serializeToString(document.documentElement);
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
  const xml = fillDocument(template.documentXml, payload);
  return zipStore([
    ['word/document.xml', encoder.encode(xml)],
    ...Object.entries(template.entries).map(([name, encoded]) => [name, base64Bytes(encoded)]),
  ]);
}
