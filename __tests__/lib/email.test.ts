import { sendLoginLinkEmail, sendMatchReadyEmail, testEmailConfig } from '@/lib/email';

// Mock nodemailer
jest.mock('nodemailer', () => {
  const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-id' });
  const verifyMock = jest.fn().mockResolvedValue(true);
  return {
    __esModule: true,
    default: {
      createTransport: jest.fn().mockReturnValue({
        sendMail: sendMailMock,
        verify: verifyMock,
      }),
    },
  };
});

const nodemailer = require('nodemailer');

describe('sendLoginLinkEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_HOST = 'smtp.test.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USER = 'user@test.com';
    process.env.EMAIL_PASS = 'password';
    process.env.EMAIL_FROM = 'Santa <santa@test.com>';
  });

  afterEach(() => {
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_PORT;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.EMAIL_FROM;
  });

  it('calls nodemailer createTransport', async () => {
    await sendLoginLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/p/tok_abc123');
    expect(nodemailer.default.createTransport).toHaveBeenCalled();
  });

  it('sends email with correct recipient', async () => {
    await sendLoginLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/p/tok_abc123');
    const sendMail = nodemailer.default.createTransport().sendMail;
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
      })
    );
  });

  it('includes the durable link in the email body', async () => {
    const link = 'https://example.com/p/tok_abc123';
    await sendLoginLinkEmail('user@example.com', 'Alice', 'Family Group', link);
    const sendMail = nodemailer.default.createTransport().sendMail;
    const callArgs = sendMail.mock.calls[0][0];
    expect(callArgs.html).toContain(link);
    expect(callArgs.text).toContain(link);
  });

  it('does not mention an expiry (the link is durable)', async () => {
    const link = 'https://example.com/p/tok_abc123';
    await sendLoginLinkEmail('user@example.com', 'Alice', 'Family Group', link);
    const sendMail = nodemailer.default.createTransport().sendMail;
    const callArgs = sendMail.mock.calls[0][0];
    expect(callArgs.html).not.toMatch(/expire/i);
    expect(callArgs.text).not.toMatch(/expire/i);
  });

  it('includes the group name in the subject', async () => {
    await sendLoginLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/p/tok_abc123');
    const sendMail = nodemailer.default.createTransport().sendMail;
    const callArgs = sendMail.mock.calls[0][0];
    expect(callArgs.subject).toContain('Family Group');
  });

  it('returns true on success', async () => {
    const result = await sendLoginLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/p/tok_abc123');
    expect(result).toBe(true);
  });

  it('returns false when sendMail throws', async () => {
    const sendMail = nodemailer.default.createTransport().sendMail;
    sendMail.mockRejectedValueOnce(new Error('SMTP error'));
    const result = await sendLoginLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/p/tok_abc123');
    expect(result).toBe(false);
  });
});

describe('sendMatchReadyEmail', () => {
  const link = 'https://example.com/p/tok_match99';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_FROM = 'Santa <santa@test.com>';
  });

  afterEach(() => {
    delete process.env.EMAIL_FROM;
  });

  it('sends to the correct recipient', async () => {
    await sendMatchReadyEmail('user@example.com', 'Alice', 'Family Group', link);
    const sendMail = nodemailer.default.createTransport().sendMail;
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com' }));
  });

  it('includes the durable link in the email body', async () => {
    await sendMatchReadyEmail('user@example.com', 'Alice', 'Family Group', link);
    const callArgs = nodemailer.default.createTransport().sendMail.mock.calls[0][0];
    expect(callArgs.html).toContain(link);
    expect(callArgs.text).toContain(link);
  });

  it('includes the group name in the subject', async () => {
    await sendMatchReadyEmail('user@example.com', 'Alice', 'Family Group', link);
    const callArgs = nodemailer.default.createTransport().sendMail.mock.calls[0][0];
    expect(callArgs.subject).toContain('Family Group');
  });

  it('never names the drawee (the drawee is not even a parameter)', async () => {
    // The recipient's own name may appear (greeting); no second identity can,
    // because the function is never given one. 'Bob' stands in for a would-be drawee.
    await sendMatchReadyEmail('user@example.com', 'Alice', 'Family Group', link);
    const callArgs = nodemailer.default.createTransport().sendMail.mock.calls[0][0];
    expect(callArgs.html).toContain('Alice');
    expect(callArgs.html).not.toMatch(/\bBob\b/);
    expect(callArgs.text).not.toMatch(/\bBob\b/);
  });

  it('does not mention an expiry (the link is durable)', async () => {
    await sendMatchReadyEmail('user@example.com', 'Alice', 'Family Group', link);
    const callArgs = nodemailer.default.createTransport().sendMail.mock.calls[0][0];
    expect(callArgs.html).not.toMatch(/expire/i);
    expect(callArgs.text).not.toMatch(/expire/i);
  });

  it('returns true on success', async () => {
    const result = await sendMatchReadyEmail('user@example.com', 'Alice', 'Family Group', link);
    expect(result).toBe(true);
  });

  it('returns false when sendMail throws', async () => {
    const sendMail = nodemailer.default.createTransport().sendMail;
    sendMail.mockRejectedValueOnce(new Error('SMTP error'));
    const result = await sendMatchReadyEmail('user@example.com', 'Alice', 'Family Group', link);
    expect(result).toBe(false);
  });
});

describe('email organiser personalisation', () => {
  const link = 'https://example.com/p/tok_org';
  const lastMail = () => nodemailer.default.createTransport().sendMail.mock.calls.at(-1)[0];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_FROM = 'Santa <santa@test.com>';
  });
  afterEach(() => {
    delete process.env.EMAIL_FROM;
  });

  it('includes the organiser name and personal message in the match-ready email when set', async () => {
    await sendMatchReadyEmail('u@e.com', 'Alice', 'Family', link, 'Aunt Mabel', 'Budget is $50, lists by Dec 1!');
    const m = lastMail();
    expect(m.html).toContain('Aunt Mabel');
    expect(m.html).toContain('Budget is $50, lists by Dec 1!');
    expect(m.text).toContain('Aunt Mabel');
    expect(m.text).toContain('Budget is $50, lists by Dec 1!');
  });

  it('includes the organiser name and personal message in the login-link email when set', async () => {
    await sendLoginLinkEmail('u@e.com', 'Alice', 'Family', link, 'Aunt Mabel', 'Welcome to the draw!');
    const m = lastMail();
    expect(m.html).toContain('Aunt Mabel');
    expect(m.html).toContain('Welcome to the draw!');
    expect(m.text).toContain('Welcome to the draw!');
  });

  it('omits the note block and organiser sign-off gracefully when unset', async () => {
    await sendMatchReadyEmail('u@e.com', 'Alice', 'Family', link);
    const m = lastMail();
    expect(m.html).not.toContain('undefined');
    expect(m.text).not.toContain('undefined');
    expect(m.html).not.toMatch(/note from/i);
  });

  it('still never names the drawee even with organiser personalisation set', async () => {
    await sendMatchReadyEmail('u@e.com', 'Alice', 'Family', link, 'Aunt Mabel', 'Have fun!');
    const m = lastMail();
    expect(m.html).toContain('Alice');
    expect(m.html).not.toMatch(/\bBob\b/);
    expect(m.text).not.toMatch(/\bBob\b/);
  });
});

describe('testEmailConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when verify succeeds', async () => {
    const result = await testEmailConfig();
    expect(result).toBe(true);
  });

  it('returns false when verify throws', async () => {
    const verifyMock = nodemailer.default.createTransport().verify;
    verifyMock.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await testEmailConfig();
    expect(result).toBe(false);
  });
});
