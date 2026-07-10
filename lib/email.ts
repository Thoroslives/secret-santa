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

// Send a person's durable personal login link (self-service resend). The link
// never expires - it's the same /p/<token> URL for the lifetime of the person -
// so there's no countdown messaging here, unlike the old ephemeral magic link.
export async function sendLoginLinkEmail(
  email: string,
  name: string,
  groupName: string,
  link: string
): Promise<boolean> {
  try {
    const transporter = createTransporter();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Secret Santa Login Link</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626, #16a34a); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #16a34a; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
    .emoji { font-size: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><span class="emoji">🎄</span> Secret Santa Login</h1>
      <p>Access your ${groupName} gift exchange</p>
    </div>
    <div class="content">
      <h2>Hi ${name}! 👋</h2>
      <p>Click the button below to log in to your Secret Santa account:</p>

      <a href="${link}" class="button">
        🎁 Log In to Secret Santa
      </a>

      <p>This is your personal login link - bookmark it and use it any time to get back to your wishlist.</p>

      <p>If you didn't request this email, you can safely ignore it.</p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

      <p style="font-size: 14px; color: #666;">
        <strong>What happens next:</strong><br>
        • View and edit your wishlist<br>
        • See who you're buying gifts for<br>
        • Check other family members' wishlists<br>
      </p>
    </div>
    <div class="footer">
      <p>Sent from your family's Secret Santa app</p>
      <p>This is an automated email, please don't reply to this address.</p>
    </div>
  </div>
</body>
</html>`;

    const textContent = `
🎄 Secret Santa Login - ${groupName}

Hi ${name}!

Click this link to log in to your Secret Santa account:
${link}

This is your personal login link - bookmark it and use it any time to get back to your wishlist.

If you didn't request this email, you can safely ignore it.

What happens next:
• View and edit your wishlist
• See who you're buying gifts for
• Check other family members' wishlists

Sent from your family's Secret Santa app
`;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Secret Santa <noreply@localhost>',
      to: email,
      subject: `🎁 Your Secret Santa Login Link - ${groupName}`,
      text: textContent,
      html: htmlContent,
    });

    return true;
  } catch (error) {
    console.error('Failed to send login link email:', error);
    return false;
  }
}

// Send the "your match is ready" notification. Deliberately NEVER names the
// drawee - it only says the match is ready and links to the person's own
// /p/<token> page, where they see who they drew and that person's wishlist.
export async function sendMatchReadyEmail(
  email: string,
  name: string,
  groupName: string,
  link: string
): Promise<boolean> {
  try {
    const transporter = createTransporter();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Secret Santa match is ready</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626, #16a34a); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #16a34a; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
    .emoji { font-size: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><span class="emoji">🎄</span> Your match is ready</h1>
      <p>${groupName} Secret Santa</p>
    </div>
    <div class="content">
      <h2>Hi ${name}! 👋</h2>
      <p>The draw is done. Tap below to see who you're buying for this year and take a look at their wishlist.</p>

      <a href="${link}" class="button">
        🎁 See my match
      </a>

      <p>This is your personal link - keep it handy to check back any time.</p>
    </div>
    <div class="footer">
      <p>Sent from your family's Secret Santa app</p>
      <p>This is an automated email, please don't reply to this address.</p>
    </div>
  </div>
</body>
</html>`;

    const textContent = `
🎄 Your Secret Santa match is ready - ${groupName}

Hi ${name}!

The draw is done. Open your personal link to see who you're buying for this year and view their wishlist:
${link}

Keep this link handy to check back any time.

Sent from your family's Secret Santa app
`;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Secret Santa <noreply@localhost>',
      to: email,
      subject: `🎁 Your Secret Santa match is ready - ${groupName}`,
      text: textContent,
      html: htmlContent,
    });

    return true;
  } catch (error) {
    console.error('Failed to send match-ready email:', error);
    return false;
  }
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