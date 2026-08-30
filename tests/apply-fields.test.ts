import { describe, expect, it } from 'vitest';
import { isValidE164Phone, isValidEmailAddress } from '../src/lib/apply-fields.js';

describe('isValidEmailAddress', () => {
  it.each([
    'you@company.com',
    'priya.shah@ai-trainers.co.uk',
    'user+tag@gmail.com',
    'a@bc.de',
  ])('accepts %s', (email) => {
    expect(isValidEmailAddress(email)).toBe(true);
  });

  it.each([
    '',
    'not-an-email',
    'user@',
    '@company.com',
    'user@@company.com',
    'user@company',
    'user@localhost',
    'user@example.com',
    'user@mail.example.com',
    'user@test.com',
    'user name@company.com',
    'user..name@company.com',
    '.user@company.com',
    'user.@company.com',
  ])('rejects %s', (email) => {
    expect(isValidEmailAddress(email)).toBe(false);
  });
});

describe('isValidE164Phone', () => {
  it.each([
    '+12025551234',
    '+1 (202) 555-1234',
    '+447911123456',
    '+919876543210',
    '+61212345678',
  ])('accepts %s', (phone) => {
    expect(isValidE164Phone(phone)).toBe(true);
  });

  it.each([
    '',
    '2025551234',
    '+1',
    '+15551234567',
    '+12025550100',
    '+11111111111',
    '+19999999999',
    '+911234567890',
    '+4402071838750',
    '+9991234567',
    '+123456',
  ])('rejects %s', (phone) => {
    expect(isValidE164Phone(phone)).toBe(false);
  });
});
