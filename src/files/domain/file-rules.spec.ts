import {
  baseMimeType,
  contentDisposition,
  contentMatchesType,
  safeFileName,
} from './file-rules';

describe('file rules', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

  it('drops MIME parameters', () => {
    expect(baseMimeType('Audio/OGG; codecs=opus')).toBe('audio/ogg');
  });

  it('checks the real signature of images and PDFs', () => {
    expect(contentMatchesType('image/png', png)).toBe(true);
    expect(contentMatchesType('image/png', Buffer.from('MZ executable'))).toBe(
      false,
    );
    expect(contentMatchesType('application/pdf', Buffer.from('%PDF-1.7'))).toBe(
      true,
    );
    // Formatos sin firma conocida no se comprueban.
    expect(contentMatchesType('text/csv', Buffer.from('a,b'))).toBe(true);
  });

  it('never keeps folders or control characters in the file name', () => {
    expect(safeFileName('../../etc/passwd', '.txt')).toBe('passwd');
    expect(safeFileName('C:\\Users\\ana\\cot"iza\u0007.pdf', '.pdf')).toBe(
      'cotiza.pdf',
    );
    expect(safeFileName(undefined, '.pdf')).toBe('archivo.pdf');
    const long = `${'a'.repeat(300)}.pdf`;
    expect(safeFileName(long, '.pdf')).toHaveLength(255);
    expect(safeFileName(long, '.pdf').endsWith('.pdf')).toBe(true);
  });

  it('builds a Content-Disposition with an ASCII fallback and the UTF-8 name', () => {
    expect(contentDisposition('Cotización ñ.pdf')).toBe(
      `attachment; filename="Cotizaci_n _.pdf"; filename*=UTF-8''Cotizaci%C3%B3n%20%C3%B1.pdf`,
    );
    expect(contentDisposition('a.pdf', 'inline')).toMatch(/^inline;/);
  });
});
