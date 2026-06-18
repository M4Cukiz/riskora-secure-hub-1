import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL    = Deno.env.get('FROM_EMAIL') ?? 'noreply@riskora.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { to, subject, html, attachments, replyTo, fromName } = await req.json();

    const from = fromName
      ? `${fromName} via Riskora <${FROM_EMAIL}>`
      : `Riskora Secure Hub <${FROM_EMAIL}>`;

    const payload: Record<string, unknown> = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    if (replyTo)          payload.reply_to    = replyTo;
    if (attachments?.length) payload.attachments = attachments;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));

    return new Response(
      JSON.stringify({ success: true, id: (data as { id: string }).id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
