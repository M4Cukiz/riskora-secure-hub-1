import Anthropic from "@anthropic-ai/sdk";
import type { Question, Response } from "@/types";
import type { ScoringResult } from "./risk";

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

export interface CriticalGap {
  area: string;
  severity: "critical" | "high" | "medium";
  description: string;
  recommendation: string;
}

export interface CategoryFinding {
  category: string;
  score: number;
  level: string;
  analysis: string;
  recommendations: string[];
}

export interface RemediationItem {
  priority: 1 | 2 | 3;
  action: string;
  framework_reference: string;
  timeline: string;
  rationale: string;
}

export interface AIAnalysis {
  executive_summary: string;
  overall_assessment: string;
  critical_gaps: CriticalGap[];
  category_findings: CategoryFinding[];
  remediation_roadmap: RemediationItem[];
  risk_acceptance_rationale: string;
}

const ANSWER_LABEL: Record<string, string> = {
  yes: "Yes — fully implemented",
  partial: "Partially implemented",
  no: "No — not implemented",
  na: "Not applicable",
};

export async function generateRiskAnalysis(params: {
  supplierName: string;
  supplierCategory: string;
  projectName: string;
  assessmentTitle: string;
  questions: Question[];
  responses: Response[];
  scoringResult: ScoringResult;
}): Promise<AIAnalysis> {
  const { supplierName, supplierCategory, projectName, assessmentTitle, questions, responses, scoringResult } = params;

  const responseMap = new Map(responses.map(r => [r.questionId, r]));

  const categoryScoresText = Object.entries(scoringResult.byCategory)
    .map(([cat, v]) => `  - ${cat}: ${v.score}/100 (${v.level} risk)`)
    .join("\n");

  const responsesText = questions.map((q, i) => {
    const r = responseMap.get(q.id);
    const answer = r ? ANSWER_LABEL[r.answer] : "Not answered";
    const comment = r?.comment ? `\n     Comment: "${r.comment}"` : "";
    return `  ${i + 1}. [${q.category}] (Weight: ${q.weight}/5)\n     Q: ${q.text}\n     A: ${answer}${comment}`;
  }).join("\n\n");

  const prompt = `You are a senior cybersecurity analyst specializing in Third-Party Risk Management (TPRM).
Analyse the following vendor security assessment and produce a structured risk report.

=== ASSESSMENT CONTEXT ===
Supplier: ${supplierName} (${supplierCategory})
Project: ${projectName}
Assessment: ${assessmentTitle}
Overall Risk Score: ${scoringResult.score}/100 → ${scoringResult.level.toUpperCase()} RISK
Weighted compliance: ${scoringResult.weightedAchieved.toFixed(1)} / ${scoringResult.weightedMax.toFixed(1)}

=== CATEGORY SCORES ===
${categoryScoresText}

=== FULL QUESTIONNAIRE RESPONSES ===
${responsesText}

=== INSTRUCTIONS ===
Based on the responses above, generate a rigorous cybersecurity risk analysis in the following JSON format.
Reference ISO 27001:2022, NIST CSF 2.0, or SOC 2 Type II controls where relevant.
Be specific — cite the actual questions and answers that drove each finding.
Do NOT fabricate information not present in the responses.

Return ONLY valid JSON matching this exact schema:
{
  "executive_summary": "string — 2–3 professional paragraphs summarising the overall risk posture, key strengths, and critical weaknesses",
  "overall_assessment": "string — one crisp sentence verdict (e.g. 'This supplier presents an UNACCEPTABLE risk profile...')",
  "critical_gaps": [
    {
      "area": "string — e.g. Access Control",
      "severity": "critical | high | medium",
      "description": "string — what is missing and why it matters",
      "recommendation": "string — specific remediation action"
    }
  ],
  "category_findings": [
    {
      "category": "string",
      "score": number,
      "level": "low | medium | high",
      "analysis": "string — 2–3 sentences on this category's posture",
      "recommendations": ["string", "string"]
    }
  ],
  "remediation_roadmap": [
    {
      "priority": 1 | 2 | 3,
      "action": "string — concrete action to take",
      "framework_reference": "string — e.g. ISO 27001 A.9.4, NIST CSF PR.AC-1",
      "timeline": "string — e.g. Immediate (0-30 days)",
      "rationale": "string — why this is prioritised"
    }
  ],
  "risk_acceptance_rationale": "string — 1–2 paragraphs advising whether to accept, accept with conditions, or reject this supplier, and what contractual or monitoring controls should apply"
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (message.content[0] as { type: string; text: string }).text;

  // Strip any markdown code fences if Claude wraps the JSON
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw];
  const jsonText = (jsonMatch[1] ?? raw).trim();

  return JSON.parse(jsonText) as AIAnalysis;
}
