import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Question, Response, RiskLevel } from "@/types";
import type { ScoringResult } from "./risk";
import type { AIAnalysis } from "./ai-analysis";

interface ReportData {
  assessmentTitle: string;
  supplierName: string;
  supplierCategory: string;
  supplierEmail: string;
  projectName: string;
  organizationName: string;
  status: string;
  sentAt?: string;
  completedAt?: string;
  questions: Question[];
  responses: Response[];
  scoringResult: ScoringResult;
  decision?: { decision: string; comment: string; decidedAt: string; decidedBy: string };
  aiAnalysis?: AIAnalysis;
}

const RISK_RGB: Record<RiskLevel, [number, number, number]> = {
  low:    [34, 197, 94],
  medium: [234, 179, 8],
  high:   [239, 68, 68],
};

const ANSWER_LABEL: Record<string, string> = {
  yes:     "Yes — Implemented",
  partial: "Partial",
  no:      "No",
  na:      "N/A",
};

const ANSWER_RGB: Record<string, [number, number, number]> = {
  yes:     [34, 197, 94],
  partial: [234, 179, 8],
  no:      [239, 68, 68],
  na:      [148, 163, 184],
};

function addPageHeader(doc: jsPDF, title: string, pageNum: number) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("RISKORA — TPRM SECURITY ASSESSMENT REPORT", 14, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(title, W - 14, 11, { align: "right" });
  doc.setTextColor(0, 0, 0);
  // Page number footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Page ${pageNum}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

function riskColor(level: RiskLevel): [number, number, number] {
  return RISK_RGB[level];
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export function generateAssessmentPDF(data: ReportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  const CONTENT_W = W - MARGIN * 2;
  let page = 1;

  /* ─── PAGE 1: COVER ─── */
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, PAGE_H, "F");

  // Accent bar
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 80, 8, 60, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("THIRD-PARTY RISK MANAGEMENT", MARGIN + 8, 95);

  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(data.assessmentTitle, CONTENT_W - 8);
  doc.text(titleLines, MARGIN + 8, 110);

  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text(`${data.supplierName}  ·  ${data.projectName}`, MARGIN + 8, 130 + (titleLines.length - 1) * 10);

  // Risk score badge
  const scoreY = 160 + (titleLines.length - 1) * 10;
  const [r, g, b] = riskColor(data.scoringResult.level);
  doc.setFillColor(r, g, b);
  doc.roundedRect(MARGIN + 8, scoreY, 50, 22, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(String(data.scoringResult.score), MARGIN + 25, scoreY + 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("/ 100", MARGIN + 38, scoreY + 13);
  doc.text(data.scoringResult.level.toUpperCase() + " RISK", MARGIN + 8, scoreY + 19);

  // Meta info
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  const metaY = scoreY + 35;
  doc.text([
    `Organisation: ${data.organizationName}`,
    `Supplier Category: ${data.supplierCategory}`,
    `Assessment Status: ${data.status.toUpperCase()}`,
    `Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
  ], MARGIN + 8, metaY, { lineHeightFactor: 1.8 });

  // Footer
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.text("RISKORA — Cybersecurity Consulting Platform  ·  Confidential", W / 2, PAGE_H - 12, { align: "center" });

  /* ─── PAGE 2: EXECUTIVE SUMMARY & SCORE ─── */
  doc.addPage();
  page++;
  addPageHeader(doc, data.assessmentTitle, page);
  let y = 28;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Executive Summary", MARGIN, y);
  y += 8;

  if (data.aiAnalysis) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    y = wrapText(doc, data.aiAnalysis.executive_summary, MARGIN, y, CONTENT_W, 5) + 4;

    // Overall assessment callout
    const [or, og, ob] = riskColor(data.scoringResult.level);
    doc.setFillColor(or, og, ob, 0.1);
    doc.setDrawColor(or, og, ob);
    doc.roundedRect(MARGIN, y, CONTENT_W, 12, 2, 2, "FD");
    doc.setTextColor(or, og, ob);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    y = wrapText(doc, data.aiAnalysis.overall_assessment, MARGIN + 4, y + 7, CONTENT_W - 8, 5) + 8;
    doc.setTextColor(0, 0, 0);
  } else {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("No AI analysis generated for this assessment.", MARGIN, y);
    y += 10;
  }

  // Category breakdown table
  y += 4;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Score by Category", MARGIN, y);
  y += 4;

  const catRows = Object.entries(data.scoringResult.byCategory).map(([cat, v]) => [
    cat, `${v.score}/100`, v.level.toUpperCase(),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Category", "Score", "Risk Level"]],
    body: catRows,
    theme: "striped",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "center" } },
    didDrawCell: (hookData) => {
      if (hookData.column.index === 2 && hookData.row.section === "body") {
        const level = (hookData.cell.raw as string).toLowerCase() as RiskLevel;
        const [cr, cg, cb] = riskColor(level);
        hookData.doc.setTextColor(cr, cg, cb);
        hookData.doc.setFont("helvetica", "bold");
      }
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  /* ─── PAGE 3: CRITICAL GAPS & REMEDIATION ─── */
  if (data.aiAnalysis && data.aiAnalysis.critical_gaps.length > 0) {
    doc.addPage();
    page++;
    addPageHeader(doc, data.assessmentTitle, page);
    y = 28;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Critical Security Gaps", MARGIN, y);
    y += 6;

    for (const gap of data.aiAnalysis.critical_gaps) {
      if (y > PAGE_H - 40) { doc.addPage(); page++; addPageHeader(doc, data.assessmentTitle, page); y = 28; }
      const sevColor: [number, number, number] = gap.severity === "critical" ? [239, 68, 68] : gap.severity === "high" ? [249, 115, 22] : [234, 179, 8];
      doc.setFillColor(...sevColor);
      doc.circle(MARGIN + 2, y - 1, 1.5, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${gap.area}`, MARGIN + 6, y);
      doc.setFontSize(8);
      doc.setTextColor(...sevColor);
      doc.text(gap.severity.toUpperCase(), W - MARGIN - 2, y, { align: "right" });
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(8.5);
      y = wrapText(doc, gap.description, MARGIN + 6, y, CONTENT_W - 6, 4.5);
      doc.setTextColor(99, 102, 241);
      doc.setFont("helvetica", "italic");
      y = wrapText(doc, `→ ${gap.recommendation}`, MARGIN + 6, y + 1, CONTENT_W - 6, 4.5) + 5;
      doc.setTextColor(0, 0, 0);
    }

    // Remediation roadmap
    if (data.aiAnalysis.remediation_roadmap.length > 0) {
      if (y > PAGE_H - 60) { doc.addPage(); page++; addPageHeader(doc, data.assessmentTitle, page); y = 28; }
      y += 4;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("Remediation Roadmap", MARGIN, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [["Priority", "Action", "Framework Reference", "Timeline"]],
        body: data.aiAnalysis.remediation_roadmap.map(r => [
          `P${r.priority}`, r.action, r.framework_reference, r.timeline,
        ]),
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5 },
        columnStyles: { 0: { cellWidth: 12, halign: "center" }, 2: { cellWidth: 38 }, 3: { cellWidth: 35 } },
        margin: { left: MARGIN, right: MARGIN },
      });
    }
  }

  /* ─── PAGE 4: QUESTIONNAIRE RESPONSES ─── */
  doc.addPage();
  page++;
  addPageHeader(doc, data.assessmentTitle, page);
  y = 28;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Questionnaire Responses", MARGIN, y);
  y += 4;

  const responseMap = new Map(data.responses.map(r => [r.questionId, r]));
  const rows = data.questions.map((q, i) => {
    const r = responseMap.get(q.id);
    return [
      String(i + 1),
      q.category,
      q.text,
      r ? ANSWER_LABEL[r.answer] : "—",
      r?.comment ?? "",
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["#", "Category", "Question", "Answer", "Comment"]],
    body: rows,
    theme: "striped",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: 28 }, 3: { cellWidth: 24 }, 4: { cellWidth: 30 } },
    didDrawCell: (hookData) => {
      if (hookData.column.index === 3 && hookData.row.section === "body") {
        const answer = Object.entries(ANSWER_LABEL).find(([, v]) => v === hookData.cell.raw)?.[0];
        if (answer && ANSWER_RGB[answer]) {
          const [ar, ag, ab] = ANSWER_RGB[answer];
          hookData.doc.setTextColor(ar, ag, ab);
          hookData.doc.setFont("helvetica", "bold");
        }
      }
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  /* ─── PAGE 5: RISK DECISION ─── */
  if (data.decision || data.aiAnalysis?.risk_acceptance_rationale) {
    doc.addPage();
    page++;
    addPageHeader(doc, data.assessmentTitle, page);
    y = 28;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Risk Decision & Rationale", MARGIN, y);
    y += 8;

    if (data.decision) {
      const decColor: Record<string, [number, number, number]> = {
        accept: [34, 197, 94],
        accept_with_conditions: [234, 179, 8],
        reject: [239, 68, 68],
      };
      const [dr, dg, db] = decColor[data.decision.decision] ?? [99, 102, 241];
      doc.setFillColor(dr, dg, db);
      doc.roundedRect(MARGIN, y, CONTENT_W, 14, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      const decLabel: Record<string, string> = {
        accept: "ACCEPTED",
        accept_with_conditions: "ACCEPTED WITH CONDITIONS",
        reject: "REJECTED",
      };
      doc.text(decLabel[data.decision.decision] ?? data.decision.decision.toUpperCase(), MARGIN + 4, y + 9);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Decided: ${data.decision.decidedAt}`, W - MARGIN - 4, y + 9, { align: "right" });
      y += 20;

      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      y = wrapText(doc, `"${data.decision.comment}"`, MARGIN, y, CONTENT_W, 5) + 8;
      doc.setFont("helvetica", "normal");
    }

    if (data.aiAnalysis?.risk_acceptance_rationale) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("AI Risk Acceptance Rationale", MARGIN, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      y = wrapText(doc, data.aiAnalysis.risk_acceptance_rationale, MARGIN, y, CONTENT_W, 5);
    }

    // Final footer
    y += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN, y, W - MARGIN, y);
    y += 6;
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `This report was generated by the Riskora TPRM Platform on ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC. ` +
      `AI analysis powered by ${data.aiAnalysis ? "Claude Sonnet 4.6 (Anthropic)" : "N/A"}.`,
      MARGIN, y,
    );
  }

  const filename = `Riskora-TPRM-${data.supplierName.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
