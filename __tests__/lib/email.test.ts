import { sendLoginLinkEmail, testEmailConfig } from '@/lib/email';

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
