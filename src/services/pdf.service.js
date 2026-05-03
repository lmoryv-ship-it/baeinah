const PDFDocument = require('pdfkit');
const path = require('path');
const fs   = require('fs');

// مسار الخط العربي — نستخدم خط النظام إن وُجد وإلا نعتمد على Helvetica
const FONT_PATH = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Bold.ttf');
const HAS_ARABIC_FONT = fs.existsSync(FONT_PATH);

const COLORS = {
    primary:  '#0f2744',
    accent:   '#c9923a',
    low:      '#16a34a',
    medium:   '#d97706',
    high:     '#dc2626',
    critical: '#7c3aed',
    muted:    '#64748b',
    border:   '#e2e8f0',
    bg:       '#f9f7f4',
};

const RISK_LABELS_AR = { low: 'منخفض', medium: 'متوسط', high: 'عالٍ', critical: 'حرج' };
const TYPE_LABELS_AR = {
    contract_analysis: 'تحليل عقد',
    labor_law:         'نظام العمل',
    medical_law:       'الأنظمة الطبية',
    company_law:       'نظام الشركات',
    general:           'استفسار قانوني عام',
};

function generatePdfReport(consultation, user) {
    return new Promise((resolve, reject) => {
        const doc    = new PDFDocument({ size: 'A4', margin: 50, rtl: false });
        const chunks = [];

        doc.on('data',  c => chunks.push(c));
        doc.on('end',   () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        if (HAS_ARABIC_FONT) {
            doc.registerFont('Arabic',     FONT_PATH);
            doc.registerFont('ArabicBold', FONT_BOLD);
        }

        const result = typeof consultation.result_json === 'string'
            ? JSON.parse(consultation.result_json)
            : consultation.result_json;

        const createdAt = new Date(consultation.created_at).toLocaleDateString('ar-SA', {
            year: 'numeric', month: 'long', day: 'numeric',
        });

        // ── غلاف التقرير ──────────────────────────────────
        doc.rect(0, 0, doc.page.width, 160).fill(COLORS.primary);

        doc.fillColor('#ffffff')
           .fontSize(28).font(HAS_ARABIC_FONT ? 'ArabicBold' : 'Helvetica-Bold')
           .text('Baeinah — بَيِّنة', 50, 40, { align: 'center' });

        doc.fontSize(13).font(HAS_ARABIC_FONT ? 'Arabic' : 'Helvetica')
           .text('Legal Analysis Report | تقرير تحليل قانوني', 50, 80, { align: 'center' });

        doc.fontSize(10).fillColor('rgba(255,255,255,0.7)')
           .text(`${createdAt}  ·  ${user?.name || ''}`, 50, 108, { align: 'center' });

        // شارة مستوى الخطر
        const riskColor = COLORS[result?.risk_level] || COLORS.muted;
        doc.roundedRect(doc.page.width / 2 - 60, 128, 120, 24, 12).fill(riskColor);
        doc.fillColor('#ffffff').fontSize(10)
           .text(
               `Risk: ${RISK_LABELS_AR[result?.risk_level] || result?.risk_level || '—'}`,
               doc.page.width / 2 - 60, 133, { width: 120, align: 'center' }
           );

        doc.moveDown(6);

        // ── معلومات الاستشارة ─────────────────────────────
        sectionHeader(doc, 'معلومات الاستشارة | Consultation Info');

        infoRow(doc, 'نوع التحليل', TYPE_LABELS_AR[consultation.type] || consultation.type);
        infoRow(doc, 'اسم الملف',   consultation.input_file_path || 'نص مباشر');
        infoRow(doc, 'تاريخ التحليل', createdAt);
        infoRow(doc, 'نوع العقد',   result?.contract_type || result?.analysis_type || '—');

        doc.moveDown(1);

        // ── الملخص التنفيذي ───────────────────────────────
        if (result?.summary_ar) {
            sectionHeader(doc, 'الملخص التنفيذي | Executive Summary');
            doc.fillColor(COLORS.primary).fontSize(10)
               .font(HAS_ARABIC_FONT ? 'Arabic' : 'Helvetica')
               .text(result.summary_ar, { align: 'right', lineGap: 4 });
            doc.moveDown(1);
        }

        // ── المخاطر ───────────────────────────────────────
        const risks = result?.risks || result?.contract_issues || result?.liability_risks || [];
        if (risks.length) {
            sectionHeader(doc, 'المخاطر المحددة | Identified Risks');
            risks.forEach((r, i) => {
                const color = COLORS[r.severity] || COLORS.muted;
                doc.circle(68, doc.y + 5, 4).fill(color);
                doc.fillColor(COLORS.primary).fontSize(10)
                   .font(HAS_ARABIC_FONT ? 'ArabicBold' : 'Helvetica-Bold')
                   .text(r.description || r.issue || r.type || '', 80, doc.y - 9,
                         { align: 'right', width: doc.page.width - 130 });
                if (r.article) {
                    doc.fillColor(COLORS.muted).fontSize(9)
                       .font(HAS_ARABIC_FONT ? 'Arabic' : 'Helvetica')
                       .text(`المادة: ${r.article}`, { align: 'right' });
                }
                if (r.recommendation || r.fix || r.mitigation) {
                    doc.fillColor('#047857').fontSize(9)
                       .text(`التوصية: ${r.recommendation || r.fix || r.mitigation}`,
                             { align: 'right' });
                }
                if (i < risks.length - 1) {
                    doc.moveTo(50, doc.y + 4).lineTo(doc.page.width - 50, doc.y + 4)
                       .strokeColor(COLORS.border).lineWidth(0.5).stroke();
                    doc.moveDown(0.5);
                }
            });
            doc.moveDown(1);
        }

        // ── التوصيات ──────────────────────────────────────
        const recs = result?.recommendations || [];
        if (recs.length) {
            sectionHeader(doc, 'التوصيات | Recommendations');
            recs.forEach((r, i) => {
                doc.fillColor(COLORS.accent).fontSize(11)
                   .font(HAS_ARABIC_FONT ? 'ArabicBold' : 'Helvetica-Bold')
                   .text(`${i + 1}.`, 50, doc.y, { continued: true, width: 20 });
                doc.fillColor(COLORS.primary).fontSize(10)
                   .font(HAS_ARABIC_FONT ? 'Arabic' : 'Helvetica')
                   .text(` ${r}`, { align: 'right' });
            });
            doc.moveDown(1);
        }

        // ── المراجع القانونية ─────────────────────────────
        const refs = result?.legal_references || [];
        if (refs.length) {
            sectionHeader(doc, 'المراجع القانونية | Legal References');
            refs.forEach(r => {
                doc.fillColor(COLORS.primary).fontSize(10)
                   .font(HAS_ARABIC_FONT ? 'ArabicBold' : 'Helvetica-Bold')
                   .text(`${r.law} — المادة ${r.article}`, { align: 'right' });
                if (r.text) {
                    doc.fillColor(COLORS.muted).fontSize(9)
                       .font(HAS_ARABIC_FONT ? 'Arabic' : 'Helvetica')
                       .text(r.text, { align: 'right', lineGap: 2 });
                }
                doc.moveDown(0.4);
            });
        }

        // ── تذييل كل صفحة ────────────────────────────────
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(pages.start + i);
            doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill('#f1f5f9');
            doc.fillColor(COLORS.muted).fontSize(8)
               .text(
                   'بَيِّنة — تحليل للأغراض التوعوية ولا يُغني عن الاستشارة القانونية المتخصصة | baeinah.sa',
                   50, doc.page.height - 26, { align: 'center', width: doc.page.width - 100 }
               );
            doc.text(`${i + 1} / ${pages.count}`, doc.page.width - 80, doc.page.height - 26);
        }

        doc.end();
    });
}

function sectionHeader(doc, title) {
    doc.rect(50, doc.y, doc.page.width - 100, 24).fill(COLORS.primary);
    doc.fillColor('#ffffff').fontSize(11)
       .font(HAS_ARABIC_FONT ? 'ArabicBold' : 'Helvetica-Bold')
       .text(title, 55, doc.y - 19, { width: doc.page.width - 110, align: 'right' });
    doc.moveDown(1.2);
}

function infoRow(doc, label, value) {
    doc.fillColor(COLORS.muted).fontSize(9)
       .font(HAS_ARABIC_FONT ? 'Arabic' : 'Helvetica')
       .text(`${label}:`, 50, doc.y, { continued: true, width: 120 });
    doc.fillColor(COLORS.primary).fontSize(9)
       .font(HAS_ARABIC_FONT ? 'ArabicBold' : 'Helvetica-Bold')
       .text(` ${value || '—'}`, { align: 'right' });
}

module.exports = { generatePdfReport };
