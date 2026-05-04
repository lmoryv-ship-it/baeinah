'use strict';
const PDFDocument = require('pdfkit');

const RISK_LABELS = {
  critical: 'حرج',
  high:     'مرتفع',
  medium:   'متوسط',
  low:      'منخفض',
};

function buildConsultationPdf(consultation, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="consultation-${consultation.id}.pdf"`
  );
  doc.pipe(res);

  const result = consultation.result || {};

  // Header
  doc.fontSize(20).text('بَيِّنة — تقرير استشارة قانونية', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`التاريخ: ${new Date(consultation.created_at).toLocaleDateString('ar-SA')}`, { align: 'right' });
  doc.text(`نوع التحليل: ${consultation.analysis_type}`, { align: 'right' });
  doc.text(`مستوى المخاطر: ${RISK_LABELS[consultation.risk_level] || consultation.risk_level || '—'}`, { align: 'right' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  if (result.executive_summary) {
    doc.fontSize(14).text('الملخص التنفيذي', { align: 'right' });
    doc.fontSize(11).text(result.executive_summary, { align: 'right' });
    doc.moveDown();
  }

  if (result.risk_explanation) {
    doc.fontSize(14).text('تحليل المخاطر', { align: 'right' });
    doc.fontSize(11).text(result.risk_explanation, { align: 'right' });
    doc.moveDown();
  }

  if (Array.isArray(result.problematic_clauses) && result.problematic_clauses.length) {
    doc.fontSize(14).text('البنود الإشكالية', { align: 'right' });
    result.problematic_clauses.forEach((c, i) => {
      doc.fontSize(12).text(`${i + 1}. ${c.clause || c.issue}`, { align: 'right' });
      if (c.issue) doc.fontSize(11).text(`المشكلة: ${c.issue}`, { align: 'right' });
      if (c.recommendation) doc.fontSize(11).text(`التوصية: ${c.recommendation}`, { align: 'right' });
      doc.moveDown(0.5);
    });
    doc.moveDown();
  }

  if (Array.isArray(result.legal_recommendations) && result.legal_recommendations.length) {
    doc.fontSize(14).text('التوصيات القانونية', { align: 'right' });
    result.legal_recommendations.forEach((r, i) => {
      doc.fontSize(12).text(`${i + 1}. ${r.title}`, { align: 'right' });
      if (r.description) doc.fontSize(11).text(r.description, { align: 'right' });
      doc.moveDown(0.5);
    });
    doc.moveDown();
  }

  if (Array.isArray(result.legislative_references) && result.legislative_references.length) {
    doc.fontSize(14).text('المراجع القانونية', { align: 'right' });
    result.legislative_references.forEach(r => {
      doc.fontSize(11).text(`• ${r.law}${r.article ? ' — المادة ' + r.article : ''}`, { align: 'right' });
    });
    doc.moveDown();
  }

  doc.fontSize(9)
     .fillColor('#888')
     .text('هذا التقرير مُنشأ بواسطة بَيِّنة للذكاء الاصطناعي القانوني — للاستخدام الاستشاري فقط', { align: 'center' });

  doc.end();
}

module.exports = { buildConsultationPdf };
