import { describe, it, expect } from 'vitest';
import { contentTypeFor } from './content-type';

const file = (name: string, type = '') => new File(['x'], name, { type });

describe('contentTypeFor', () => {
  it("uses the browser's type when it has one", () => {
    expect(contentTypeFor(file('photo.png', 'image/png'))).toBe('image/png');
  });

  it('keeps the browser answer even where the map would say otherwise', () => {
    // The OS knows this machine's associations. Second-guessing it here would
    // only make the stored type disagree with what the user's own apps expect.
    expect(contentTypeFor(file('export.csv', 'application/vnd.ms-excel'))).toBe(
      'application/vnd.ms-excel'
    );
  });

  it('fills in from the extension when the browser has nothing', () => {
    // An iPhone photo on a Windows machine is the common case.
    expect(contentTypeFor(file('IMG_0001.heic'))).toBe('image/heic');
    expect(contentTypeFor(file('holiday.mkv'))).toBe('video/x-matroska');
  });

  it('reads the extension case-insensitively', () => {
    expect(contentTypeFor(file('IMG_0001.HEIC'))).toBe('image/heic');
  });

  it('says binary when neither knows, rather than sending nothing', () => {
    expect(contentTypeFor(file('data.unknownext'))).toBe('application/octet-stream');
    expect(contentTypeFor(file('LICENSE'))).toBe('application/octet-stream');
  });
});
