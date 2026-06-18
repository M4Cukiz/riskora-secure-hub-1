import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// Untyped client for tables/functions not yet in generated types
const db = supabase as unknown as SupabaseClient;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendQuestionnaireEmail(options: {
  assessmentId: string;
  supplierEmail: string;
  supplierName: string;
  supplierType: 'IT' | 'Non-IT';
  assessmentTitle: string;
  projectName: string;
  consultantName: string;
}): Promise<{ success: boolean; token: string; questionnaireUrl: string }> {
  const {
    assessmentId, supplierEmail, supplierName, supplierType,
    assessmentTitle, projectName, consultantName,
  } = options;

  // Delete any existing token for this assessment (re-send generates a fresh one)
  await db.from('questionnaire_tokens').delete().eq('assessment_id', assessmentId);

  // Insert new token — token column defaults to gen_random_bytes hex
  const { data: tokenRow, error: tokenError } = await db
    .from('questionnaire_tokens')
    .insert({ assessment_id: assessmentId, supplier_email: supplierEmail, supplier_type: supplierType })
    .select('token')
    .single();

  if (tokenError || !tokenRow) throw new Error('Failed to create questionnaire token');

  const token = (tokenRow as { token: string }).token;
  const baseUrl = window.location.origin;
  const questionnaireUrl = `${baseUrl}/q/${token}`;

  const isIT = supplierType === 'IT';
  const year = new Date().getFullYear();

  const html = `
<div style="background:#f4f6f8;padding:0;margin:0;width:100%;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="padding:24px 32px;background:linear-gradient(135deg,#0F172A 0%,#4F46E5 100%);border-radius:12px 12px 0 0;">
            <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;">Riskora Secure Hub</h1>
            <p style="margin:4px 0 0;font-size:12px;color:#a5b4fc;text-transform:uppercase;letter-spacing:1.5px;">TPRM Platform</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
            <p style="font-size:15px;color:#334155;">Hello <strong>${escapeHtml(supplierName)}</strong>,</p>
            <p style="font-size:15px;color:#334155;">
              <strong>${escapeHtml(consultantName)}</strong> has sent you a security questionnaire as part of the
              TPRM assessment <strong>${escapeHtml(assessmentTitle)}</strong>
              (project: ${escapeHtml(projectName)}).
            </p>
            <div style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;
              background:${isIT ? '#eff6ff' : '#fffbeb'};
              color:${isIT ? '#1d4ed8' : '#92400e'};
              border:1px solid ${isIT ? '#bfdbfe' : '#fde68a'};
              margin-bottom:16px;">
              ${isIT ? '🖥 IT Supplier' : '🏢 Non-IT Supplier'}
            </div>
            <p style="margin:24px 0;text-align:center;">
              <a href="${questionnaireUrl}"
                style="background:#4F46E5;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
                Complete Questionnaire →
              </a>
            </p>
            <p style="color:#64748b;font-size:13px;">
              Or copy this link:<br/>
              <a href="${questionnaireUrl}" style="color:#4F46E5;word-break:break-all;">${questionnaireUrl}</a>
            </p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:20px;">
              <p style="margin:0;font-size:13px;color:#92400e;">
                ⏱️ This link expires in <strong>30 days</strong>.
                If you did not expect this email, please ignore it.
              </p>
            </div>
            <p style="margin-top:24px;font-size:14px;color:#64748b;">
              Best regards,<br/>${escapeHtml(consultantName)}
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">© ${year} Riskora Secure Hub · Confidential</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</div>`;

  const { error: fnError } = await supabase.functions.invoke('resend-email', {
    body: {
      to: [supplierEmail],
      subject: `Security Questionnaire Request — ${assessmentTitle}`,
      html,
    },
  });

  if (fnError) {
    console.warn('Email send failed, URL available for manual sharing:', fnError.message);
    return { success: false, token, questionnaireUrl };
  }

  return { success: true, token, questionnaireUrl };
}
