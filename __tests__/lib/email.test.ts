import crypto from 'crypto';
import { generateMagicToken, verifyMagicToken, sendMagicLinkEmail, testEmailConfig } from '@/lib/email';

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

const sampleData = {
  personId: 'person-123',
  email: 'test@example.com',
  groupId: 'group-456',
  expires: Date.now() + 60 * 60 * 1000,
};

describe('generateMagicToken', () => {
  beforeEach(() => {
    process.env.MAGIC_LINK_SECRET = 'test-secret-key';
    process.env.MAGIC_LINK_EXPIRES_MINUTES = '15';
  });

  afterEach(() => {
    delete process.env.MAGIC_LINK_SECRET;
    delete process.env.MAGIC_LINK_EXPIRES_MINUTES;
  });

  it('returns a non-empty string', () => {
    const token = generateMagicToken(sampleData);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('returns a base64url-encoded string', () => {
    const token = generateMagicToken(sampleData);
    // base64url should not contain +, /, or =
    expect(token).not.toMatch(/[+/=]/);
  });

  it('contains the original data when decoded', () => {
    const token = generateMagicToken(sampleData);
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    // payload is stored as a JSON string
    const payload = JSON.parse(decoded.payload);
    expect(payload.personId).toBe(sampleData.personId);
    expect(payload.email).toBe(sampleData.email);
    expect(payload.groupId).toBe(sampleData.groupId);
    expect(typeof decoded.signature).toBe('string');
  });

  it('sets its own expiration based on MAGIC_LINK_EXPIRES_MINUTES', () => {
    const before = Date.now();
    const token = generateMagicToken(sampleData);
    const after = Date.now();
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    const payload = JSON.parse(decoded.payload);
    // The function overrides expires with Date.now() + 15 minutes
    const fifteenMin = 15 * 60 * 1000;
    expect(payload.expires).toBeGreaterThanOrEqual(before + fifteenMin);
    expect(payload.expires).toBeLessThanOrEqual(after + fifteenMin);
  });

  it('generates different tokens for different data', () => {
    const token1 = generateMagicToken(sampleData);
    const token2 = generateMagicToken({ ...sampleData, personId: 'person-999' });
    expect(token1).not.toBe(token2);
  });
});

describe('verifyMagicToken', () => {
  beforeEach(() => {
    process.env.MAGIC_LINK_SECRET = 'test-secret-key';
    process.env.MAGIC_LINK_EXPIRES_MINUTES = '15';
  });

  afterEach(() => {
    delete process.env.MAGIC_LINK_SECRET;
    delete process.env.MAGIC_LINK_EXPIRES_MINUTES;
  });

  it('returns null for completely invalid base64', () => {
    expect(verifyMagicToken('!!!not-valid-base64!!!')).toBeNull();
  });

  it('returns null for valid base64 but invalid JSON', () => {
    const token = Buffer.from('not json at all').toString('base64url');
    expect(verifyMagicToken(token)).toBeNull();
  });

  it('returns null for a tampered payload', () => {
    const token = generateMagicToken(sampleData);
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    // Tamper with the payload (it's a JSON string, so parse, modify, re-stringify)
    const payload = JSON.parse(decoded.payload);
    payload.personId = 'hacker-id';
    decoded.payload = JSON.stringify(payload);
    const tamperedToken = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    expect(verifyMagicToken(tamperedToken)).toBeNull();
  });

  it('returns null for a tampered signature', () => {
    const token = generateMagicToken(sampleData);
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    decoded.signature = 'deadbeef'.repeat(8);
    const tamperedToken = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    expect(verifyMagicToken(tamperedToken)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(verifyMagicToken('')).toBeNull();
  });

  it('returns null for an expired token', () => {
    // Manually construct a token that is already expired
    const secret = 'test-secret-key';
    const payload = {
      personId: 'person-123',
      email: 'test@example.com',
      groupId: 'group-456',
      expires: Date.now() - 1000, // expired 1 second ago
    };
    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
    const token = Buffer.from(JSON.stringify({ payload: payloadString, signature })).toString('base64url');
    expect(verifyMagicToken(token)).toBeNull();
  });

  it('verifies a correctly constructed token with string payload', () => {
    // The verifyMagicToken function expects payload to be a JSON string (not an object)
    // because it calls crypto.update(payload) and then JSON.parse(payload)
    const secret = 'test-secret-key';
    const payload = {
      personId: 'person-123',
      email: 'test@example.com',
      groupId: 'group-456',
      expires: Date.now() + 15 * 60 * 1000,
    };
    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
    // Store payload as a string so that verifyMagicToken can call .update(payload) correctly
    const token = Buffer.from(JSON.stringify({ payload: payloadString, signature })).toString('base64url');
    const result = verifyMagicToken(token);
    expect(result).not.toBeNull();
    expect(result!.personId).toBe('person-123');
    expect(result!.email).toBe('test@example.com');
    expect(result!.groupId).toBe('group-456');
  });

  it('roundtrip with generateMagicToken works correctly', () => {
    const token = generateMagicToken(sampleData);
    const result = verifyMagicToken(token);
    expect(result).not.toBeNull();
    expect(result!.personId).toBe(sampleData.personId);
    expect(result!.email).toBe(sampleData.email);
    expect(result!.groupId).toBe(sampleData.groupId);
  });
});

describe('sendMagicLinkEmail', () => {
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
    await sendMagicLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/magic');
    expect(nodemailer.default.createTransport).toHaveBeenCalled();
  });

  it('sends email with correct recipient', async () => {
    await sendMagicLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/magic');
    const sendMail = nodemailer.default.createTransport().sendMail;
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
      })
    );
  });

  it('includes the magic link in the email body', async () => {
    const magicLink = 'https://example.com/magic?token=abc123';
    await sendMagicLinkEmail('user@example.com', 'Alice', 'Family Group', magicLink);
    const sendMail = nodemailer.default.createTransport().sendMail;
    const callArgs = sendMail.mock.calls[0][0];
    expect(callArgs.html).toContain(magicLink);
    expect(callArgs.text).toContain(magicLink);
  });

  it('includes the group name in the subject', async () => {
    await sendMagicLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/magic');
    const sendMail = nodemailer.default.createTransport().sendMail;
    const callArgs = sendMail.mock.calls[0][0];
    expect(callArgs.subject).toContain('Family Group');
  });

  it('returns true on success', async () => {
    const result = await sendMagicLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/magic');
    expect(result).toBe(true);
  });

  it('returns false when sendMail throws', async () => {
    const sendMail = nodemailer.default.createTransport().sendMail;
    sendMail.mockRejectedValueOnce(new Error('SMTP error'));
    const result = await sendMagicLinkEmail('user@example.com', 'Alice', 'Family Group', 'https://example.com/magic');
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
