// PDF «сервисной книжки»: рисует данные из servicebook.js библиотекой jsPDF (лежит в app/vendor, MIT)
// со шрифтом Montserrat (кириллица, OFL). Библиотека подгружается только при выгрузке.

import { PDF_FONTS, PDF_LIBS } from './config.js';

const PAGE_MARGIN = 40;
const TEXT = [27, 35, 69];
const MUTED = [110, 114, 135];
const LINE = [220, 220, 228];
const PHOTO_W = 150;
const PHOTO_MAX_H = 100;

let ready = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('не загрузилась библиотека PDF — открой приложение с интернетом один раз'));
    document.head.append(s);
  });
}

async function fontBase64(url) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Загрузить библиотеку и шрифты заранее (когда открыли окно выгрузки), чтобы кнопка сработала сразу.
export function preparePdf() {
  if (!ready) {
    ready = (async () => {
      for (const src of PDF_LIBS) await loadScript(src);
      return { normal: await fontBase64(PDF_FONTS.normal), bold: await fontBase64(PDF_FONTS.bold) };
    })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}

function imageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// data — из serviceBookData; photo — dataURL обложки или null; sums — показывать колонку «грн».
export async function serviceBookPdf(data, { photo = null, sums = true } = {}) {
  const fonts = await preparePdf();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.addFileToVFS('Montserrat-Regular.ttf', fonts.normal);
  doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
  doc.addFileToVFS('Montserrat-SemiBold.ttf', fonts.bold);
  doc.addFont('Montserrat-SemiBold.ttf', 'Montserrat', 'bold');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const x = PAGE_MARGIN;

  // Фото машины справа сверху.
  let photoBottom = 0;
  if (photo) {
    const size = await imageSize(photo);
    if (size) {
      const h = Math.min(PHOTO_MAX_H, (PHOTO_W * size.h) / size.w);
      const w = (h * size.w) / size.h;
      doc.addImage(photo, 'JPEG', pageW - PAGE_MARGIN - w, PAGE_MARGIN, w, h);
      photoBottom = PAGE_MARGIN + h;
    }
  }
  const textW = pageW - 2 * PAGE_MARGIN - (photo ? PHOTO_W + 16 : 0);

  let y = PAGE_MARGIN + 16;
  doc.setFont('Montserrat', 'bold').setFontSize(20).setTextColor(...TEXT).text(data.title, x, y);
  y += 16;
  doc.setFont('Montserrat', 'normal').setFontSize(9.5).setTextColor(...MUTED);
  const sub = doc.splitTextToSize(data.subtitle, textW);
  doc.text(sub, x, y);
  y += sub.length * 12 + 8;
  for (const [k, v] of data.facts) {
    doc.setFont('Montserrat', 'normal').setFontSize(9.5).setTextColor(...MUTED).text(k, x, y);
    doc.setFont('Montserrat', 'bold').setTextColor(...TEXT).text(v, x + 95, y);
    y += 14;
  }
  y = Math.max(y, photoBottom) + 12;

  const head = ['Дата', 'Пробег', 'Что сделано', 'Категория / СТО', ...(sums ? ['грн'] : [])];
  const body = data.rows.map((r) => [r.date, r.km, r.what, r.cats, ...(sums ? [r.sum] : [])]);
  const common = {
    theme: 'plain',
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN + 14 },
    styles: { font: 'Montserrat', fontSize: 8.5, textColor: TEXT, cellPadding: { top: 5, bottom: 5, left: 3, right: 3 }, valign: 'top' },
    headStyles: { fontStyle: 'bold', textColor: MUTED, fontSize: 8 },
    didDrawCell: (c) => {
      // Линия под каждой строкой; под шапкой — жирная.
      if (c.section === 'foot') return;
      const w = c.section === 'head' ? 1.2 : 0.5;
      doc.setDrawColor(...(c.section === 'head' ? TEXT : LINE)).setLineWidth(w);
      doc.line(c.cell.x, c.cell.y + c.cell.height, c.cell.x + c.cell.width, c.cell.y + c.cell.height);
    },
  };
  doc.autoTable({
    ...common,
    startY: y,
    head: [head],
    body,
    foot: sums ? [['Итого', '', '', '', data.total]] : undefined,
    footStyles: { fontStyle: 'bold', textColor: TEXT, fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 58 }, 1: { cellWidth: 50 }, 3: { cellWidth: 95, textColor: MUTED },
      ...(sums ? { 4: { cellWidth: 48, halign: 'right' } } : {}),
    },
  });

  if (data.last.length) {
    y = doc.lastAutoTable.finalY + 22;
    if (y > pageH - 120) { doc.addPage(); y = PAGE_MARGIN + 10; }
    doc.setFont('Montserrat', 'bold').setFontSize(11).setTextColor(...TEXT).text('Последние замены и проверки', x, y);
    doc.autoTable({
      ...common,
      startY: y + 6,
      body: data.last,
      columnStyles: { 0: { cellWidth: 170, textColor: MUTED }, 1: { fontStyle: 'bold' } },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('Montserrat', 'normal').setFontSize(8).setTextColor(...MUTED);
    doc.text(data.footer, x, pageH - PAGE_MARGIN + 10);
    doc.text(`стр. ${i} из ${pages}`, pageW - PAGE_MARGIN, pageH - PAGE_MARGIN + 10, { align: 'right' });
  }
  return new File([doc.output('blob')], data.fileName, { type: 'application/pdf' });
}
