import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const htmlPath = path.resolve(process.cwd(), 'index.html');

describe('StylesheetLinks', () => {
  it('links reset.css and tokens.css in index.html head', () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('href="/src/styles/reset.css"');
    expect(html).toContain('href="/src/styles/tokens.css"');
    expect(html).toContain('href="/src/styles/loading.css"');
    expect(html).toContain('href="/src/styles/error.css"');
  });
});
