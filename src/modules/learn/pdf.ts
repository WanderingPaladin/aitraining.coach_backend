import { randomBytes } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildAppUrl } from '../../lib/app-url.js';

export async function buildCertificatePdf(input: {
  learnerName: string;
  score: number;
  credentialId: string;
  issuedAt: Date;
  shareScore: boolean;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([792, 612]);
  const heading = await doc.embedFont(StandardFonts.TimesRomanBold);
  const body = await doc.embedFont(StandardFonts.TimesRoman);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const navy = rgb(0.008, 0.027, 0.133);
  const ink = rgb(0.03, 0.06, 0.17);
  const muted = rgb(0.4, 0.45, 0.55);
  const accent = rgb(0.09, 0.53, 1);

  page.drawRectangle({ x: 0, y: 0, width: 792, height: 612, color: rgb(0.98, 0.99, 1) });
  page.drawRectangle({ x: 28, y: 28, width: 736, height: 556, borderColor: navy, borderWidth: 1.4 });
  page.drawRectangle({ x: 36, y: 36, width: 720, height: 540, borderColor: rgb(0.72, 0.78, 0.9), borderWidth: 0.6 });
  page.drawRectangle({ x: 36, y: 548, width: 720, height: 6, color: accent });

  page.drawText('AITRAINERS.COACH', {
    x: 56,
    y: 510,
    size: 11,
    font: sans,
    color: accent,
  });
  page.drawText('AI Training Foundations', {
    x: 56,
    y: 468,
    size: 28,
    font: heading,
    color: navy,
  });
  page.drawText('Certificate of Completion', {
    x: 56,
    y: 436,
    size: 16,
    font: body,
    color: ink,
  });
  page.drawText('This certifies that', {
    x: 56,
    y: 392,
    size: 12,
    font: body,
    color: muted,
  });
  page.drawText(input.learnerName, {
    x: 56,
    y: 358,
    size: 32,
    font: heading,
    color: navy,
  });
  page.drawText('has successfully completed the AI Training Foundations educational program', {
    x: 56,
    y: 322,
    size: 13,
    font: body,
    color: ink,
  });
  page.drawText('and met the program’s internal readiness-assessment requirement, covering prompt', {
    x: 56,
    y: 302,
    size: 12,
    font: body,
    color: muted,
  });
  page.drawText('interpretation, instruction following, response evaluation, factuality, and written reasoning.', {
    x: 56,
    y: 286,
    size: 12,
    font: body,
    color: muted,
  });

  const issued = input.issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const meta = [
    input.shareScore ? `Assessment Score: ${input.score}/100` : 'Assessment: Passed',
    `Issued: ${issued}`,
    `Credential ID: ${input.credentialId}`,
    `Verify: ${buildAppUrl(`/certificate/${input.credentialId}`)}`,
  ];
  meta.forEach((line, index) => {
    page.drawText(line, { x: 56, y: 230 - index * 18, size: 11, font: sans, color: ink });
  });

  page.drawText(
    'This certificate confirms completion of an educational program provided by AITrainers.coach. It is not a professional license or third-party accreditation and does not guarantee employment, acceptance by any AI-training platform, project availability, or income.',
    {
      x: 56,
      y: 64,
      size: 8,
      font: sans,
      color: muted,
      maxWidth: 680,
    },
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export function newCredentialId(now = new Date()): string {
  const year = String(now.getFullYear()).slice(-2);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(5);
  let code = '';
  for (const value of bytes) {
    code += alphabet[value % alphabet.length];
  }
  return `ATC-FND-${year}-${code}`;
}
