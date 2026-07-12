import nodemailer from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

// Create email transporter
function createTransporter(): nodemailer.Transporter {
  const config: EmailConfig = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASS || '',
    },
    from: process.env.EMAIL_FROM || 'Secret Santa <noreply@localhost>',
  };

  return nodemailer.createTransport(config);
}

// ---------------------------------------------------------------------------
// Warm-hearth email theme (see DESIGN.md). Email clients don't support OKLCH,
// web fonts unreliably, or external CSS, so the palette is baked to hex and
// every style is inline on a table layout. Colours are the DESIGN.md tokens
// converted to sRGB. Pine is the only filled button (white text); gold is only
// ever a thin rule, the wordmark, or a link - never a text-bearing fill.
// The serif/sans stacks lead with the brand fonts and fall back to system
// families; Georgia is a deliberate email-only serif fallback (it renders when
// Hedvig Letters Serif can't load in a mail client) despite being off the app's
// in-product reject list.
// ---------------------------------------------------------------------------
const C = {
  bg: '#140e0a',
  surface: '#1f1812',
  border: '#3a312b',
  ink: '#efebe2',
  inkStrong: '#f9f6f1',
  muted: '#a9a49b',
  primary: '#428653',
  onPrimary: '#f6fcf7',
  accentText: '#f6c662',
  accentDim: '#b7924b',
};
const SERIF = "'Hedvig Letters Serif', Georgia, 'Times New Roman', serif";
const SANS = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface EmailContent {
  preheader: string;
  heading: string;
  intro: string;
  ctaLabel: string;
  link: string;
  bodyAfter: string;
  groupName: string;
}

function buildEmail(c: EmailContent): { html: string; text: string } {
  const heading = escapeHtml(c.heading);
  const intro = escapeHtml(c.intro);
  const bodyAfter = escapeHtml(c.bodyAfter);
  const ctaLabel = escapeHtml(c.ctaLabel);
  const link = escapeHtml(c.link);
  const footer = "Sent from your family&#39;s Secret Santa. This is an automated message, no need to reply.";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>${heading}</title>
</head>
<body style="margin:0; padding:0; background-color:${C.bg};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${C.bg};">${escapeHtml(c.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%; max-width:600px; background-color:${C.surface}; border:1px solid ${C.border}; border-radius:12px;">
          <tr>
            <td style="padding:28px 32px 6px 32px; text-align:center;">
              <div style="width:36px; height:2px; background-color:${C.accentDim}; margin:0 auto 14px auto; line-height:2px; font-size:0;">&nbsp;</div>
              <div style="font-family:${SERIF}; font-size:22px; letter-spacing:-0.01em; color:${C.accentText};">Secret Santa</div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 32px 4px 32px;">
              <h1 style="margin:0 0 12px 0; font-family:${SERIF}; font-size:26px; font-weight:500; line-height:1.25; color:${C.inkStrong};">${heading}</h1>
              <p style="margin:0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${C.ink};">${intro}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 4px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto;">
                <tr>
                  <td align="center" bgcolor="${C.primary}" style="border-radius:8px;">
                    <a href="${link}" style="display:inline-block; padding:14px 32px; font-family:${SANS}; font-size:16px; font-weight:600; color:${C.onPrimary}; text-decoration:none; border-radius:8px;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 32px 8px 32px;">
              <p style="margin:0 0 16px 0; font-family:${SANS}; font-size:15px; line-height:1.6; color:${C.ink};">${bodyAfter}</p>
              <p style="margin:0; font-family:${SANS}; font-size:13px; line-height:1.5; color:${C.muted};">If the button doesn&#39;t work, paste this link into your browser:<br><a href="${link}" style="color:${C.accentText}; text-decoration:underline; word-break:break-all;">${link}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px;">
              <div style="height:1px; background-color:${C.border}; line-height:1px; font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px 32px; text-align:center;">
              <p style="margin:0; font-family:${SANS}; font-size:12px; line-height:1.5; color:${C.muted};">${footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Secret Santa
${c.groupName}

${c.heading}

${c.intro}

${c.ctaLabel}: ${c.link}

${c.bodyAfter}

Sent from your family's Secret Santa. This is an automated message, no need to reply.
`;

  return { html, text };
}

// Build + send one themed email. The two public senders below differ only in
// their content, subject, and error label; the transport + envelope live here.
async function sendThemedEmail(
  to: string,
  subject: string,
  content: EmailContent,
  errorLabel: string
): Promise<boolean> {
  try {
    const transporter = createTransporter();
    const { html, text } = buildEmail(content);
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Secret Santa <noreply@localhost>',
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error(errorLabel, error);
    return false;
  }
}

// Send a person's durable personal login link (self-service resend). The link
// never expires - it's the same /p/<token> URL for the lifetime of the person -
// so there's no countdown messaging, unlike the old ephemeral magic link.
export async function sendLoginLinkEmail(
  email: string,
  name: string,
  groupName: string,
  link: string
): Promise<boolean> {
  return sendThemedEmail(
    email,
    `${groupName}: your sign-in link`,
    {
      preheader: `Your personal link to your ${groupName} wishlist.`,
      heading: 'Your sign-in link',
      intro: `Hi ${name}, here is your personal link for ${groupName}.`,
      ctaLabel: 'Open my wishlist',
      link,
      bodyAfter: "It is yours to keep. Bookmark it and use it any time to get back to your wishlist. If you didn't ask for this, you can safely ignore this email.",
      groupName,
    },
    'Failed to send login link email:'
  );
}

// Send the "your match is ready" notification. Deliberately NEVER names the
// drawee - the drawee is not even passed in - it only says the match is ready
// and links to the person's own /p/<token> page, where they see who they drew
// and that person's wishlist.
export async function sendMatchReadyEmail(
  email: string,
  name: string,
  groupName: string,
  link: string
): Promise<boolean> {
  return sendThemedEmail(
    email,
    `${groupName}: your match is ready`,
    {
      preheader: `The ${groupName} draw is done. Tap to see who you're buying for.`,
      heading: 'Your match is ready',
      intro: `Hi ${name}, the draw for ${groupName} is done.`,
      ctaLabel: 'See my match',
      link,
      bodyAfter: 'Tap through to see who you are buying for this year and take a look at their wishlist. Keep your link handy to check back any time.',
      groupName,
    },
    'Failed to send match-ready email:'
  );
}

// Test email configuration
export async function testEmailConfig(): Promise<boolean> {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email configuration test failed:', error);
    return false;
  }
}
