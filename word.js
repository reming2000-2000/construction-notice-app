const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const VML = 'urn:schemas-microsoft-com:vml';
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

function growOutline(document, extraLines) {
  // Keep the template's work frame, including its legacy Word fallback.
  // Only extend the bottom edge for work text that needs over two lines.
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
  const { values, mode, notes, fullEnd, compactStart, extraOutlineLines } = payload;
  if (fields.size !== Object.keys(values).length || [...fields.keys()].some(key => !Object.hasOwn(values, key))) {
    throw new Error('テンプレートの差し込み欄が一致しません。');
  }

  const paragraph = key => fields.get(key).parentNode.parentNode;
  const optional = ['notesHeading', ...Object.keys(values).filter(key => /^notice[1-6]$/.test(key))];
  if (mode === 'short') optional.push('notice2Detail');
  for (const key of optional) {
    if (!values[key]) paragraph(key).remove();
  }
  for (const { key, gapAfter } of notes) {
    if (gapAfter) {
      const spacing = paragraph(key).getElementsByTagNameNS(W, 'spacing')[0];
      spacing.setAttributeNS(W, 'w:after', String(gapAfter * 20));
    }
  }
  if (!notes.length) {
    const contactHeading = paragraph('contact').previousElementSibling;
    contactHeading.getElementsByTagNameNS(W, 'spacing')[0].setAttributeNS(W, 'w:before', '358');
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
  if (extraOutlineLines) growOutline(document, extraOutlineLines);
  for (const [key, field] of fields) {
    // Assign as text, keeping the source run properties and escaping XML once.
    field.textContent = values[key];
  }
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
