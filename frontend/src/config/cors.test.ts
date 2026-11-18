import { describe, expect, it } from 'vitest';
import { CORS_ALLOWED_METHODS, CORS_REQUEST_HEADERS, getCorsPolicy, type CorsPolicy } from './cors';
import { S3_PROVIDERS } from './providers';

const ORIGIN = 'https://drive.example.test';

interface Rule {
  AllowedHeaders?: string[];
  AllowedMethods?: string[];
  AllowedOrigins?: string[];
  ExposeHeaders?: string[];
  MaxAgeSeconds?: number;
}

/** The rules in a policy, whichever of its supported formats it is in. */
function rulesOf(policy: CorsPolicy): Rule[] {
  if (policy.format === 'json') {
    const parsed: unknown = JSON.parse(policy.text);
    if (Array.isArray(parsed)) return parsed as Rule[];
    return (parsed as { CORSRules: Rule[] }).CORSRules;
  }

  if (policy.format === 'xml') {
    const doc = new DOMParser().parseFromString(policy.text, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.tagName).toBe('CORSConfiguration');
    const values = (rule: Element, tag: string) =>
      [...rule.getElementsByTagName(tag)].map((el) => el.textContent ?? '');
    return [...doc.getElementsByTagName('CORSRule')].map((rule) => ({
      AllowedHeaders: values(rule, 'AllowedHeader'),
      AllowedMethods: values(rule, 'AllowedMethod'),
      AllowedOrigins: values(rule, 'AllowedOrigin'),
      ExposeHeaders: values(rule, 'ExposeHeader'),
      MaxAgeSeconds: Number(values(rule, 'MaxAgeSeconds')[0]),
    }));
  }

  return [];
}

describe('CORS policies', () => {
  it.each(S3_PROVIDERS.map((p) => [p.name, p] as const))('%s has a policy', (_name, provider) => {
    expect(getCorsPolicy(provider.id, ORIGIN)).not.toBeNull();
  });

  const documentPolicies = S3_PROVIDERS.map((p) => [p.name, p.id] as const).filter(
    ([, id]) => getCorsPolicy(id, ORIGIN)?.format !== 'shell'
  );

  describe.each(documentPolicies)('%s', (_name, id) => {
    const policy = getCorsPolicy(id, ORIGIN)!;
    const rules = rulesOf(policy);

    it('parses, and holds at least one rule', () => {
      expect(rules.length).toBeGreaterThan(0);
    });

    it.each(rules.map((rule, index) => [index, rule] as const))('rule %i', (_index, rule) => {
      // The origin is the page's own, not a placeholder to replace.
      expect(rule.AllowedOrigins).toEqual([ORIGIN]);

      for (const method of CORS_ALLOWED_METHODS) {
        expect(rule.AllowedMethods).toContain(method);
      }

      // Every signed request needs a preflight to accept its headers.
      const allowed = (rule.AllowedHeaders ?? []).map((h) => h.toLowerCase());
      if (!allowed.includes('*')) {
        for (const header of CORS_REQUEST_HEADERS) expect(allowed).toContain(header);
      }

      // Multipart uploads read each part's ETag.
      expect(rule.ExposeHeaders).toContain('ETag');

      // Backblaze, the strictest here, caps this at one day.
      expect(rule.MaxAgeSeconds).toBeGreaterThan(0);
      expect(rule.MaxAgeSeconds).toBeLessThanOrEqual(86400);
    });
  });

  it('gives the consoles that take a pasted policy a JSON array of rules', () => {
    for (const id of ['aws', 'cloudflare', 'wasabi', 'custom']) {
      const policy = getCorsPolicy(id, ORIGIN)!;
      expect(policy.format).toBe('json');
      expect(Array.isArray(JSON.parse(policy.text))).toBe(true);
      expect(policy.file).toBeUndefined();
    }
  });

  it('applies Backblaze rules through the S3 API, where POST is allowed', () => {
    const policy = getCorsPolicy('backblaze', ORIGIN)!;
    expect(JSON.parse(policy.text)).toHaveProperty('CORSRules');
    expect(policy.file?.name).toBe('cors.json');
    expect(policy.file?.command).toContain('aws s3api put-bucket-cors');
    expect(policy.file?.command).toContain('--cors-configuration file://cors.json');
    expect(policy.file?.command).toContain('backblazeb2.com');
  });

  it('gives DigitalOcean Spaces an XML file for s3cmd, with the same rule as Amazon S3', () => {
    const policy = getCorsPolicy('digitalocean', ORIGIN)!;
    expect(policy.format).toBe('xml');
    expect(policy.file?.name).toBe('cors.xml');
    expect(policy.file?.command).toBe('s3cmd setcors cors.xml s3://YOUR_SPACE');

    // The control panel cannot expose headers, which is the whole reason for
    // the file; the rule has to match what the S3 console version allows.
    const [xmlRule] = rulesOf(policy);
    const [awsRule] = rulesOf(getCorsPolicy('aws', ORIGIN)!);
    expect({ ...xmlRule, MaxAgeSeconds: 0 }).toEqual({ ...awsRule, MaxAgeSeconds: 0 });
  });

  it('escapes an origin that would break the XML', () => {
    const policy = getCorsPolicy('digitalocean', 'https://a.test/?x=1&y=<2>')!;
    expect(policy.text).toContain(
      '<AllowedOrigin>https://a.test/?x=1&amp;y=&lt;2&gt;</AllowedOrigin>'
    );
  });

  it('sets the MinIO origin list for the whole server', () => {
    const policy = getCorsPolicy('minio', ORIGIN)!;
    expect(policy.format).toBe('shell');
    expect(policy.text).toBe(`mc admin config set myminio api cors_allow_origin="${ORIGIN}"`);
  });

  it('never ships the old placeholder origin', () => {
    for (const provider of S3_PROVIDERS) {
      const policy = getCorsPolicy(provider.id, ORIGIN)!;
      expect(policy.text).not.toContain('your-domain.com');
    }
  });

  it('has nothing for an unknown provider', () => {
    expect(getCorsPolicy('nope', ORIGIN)).toBeNull();
  });

  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__'])(
    'does not mistake an Object.prototype key for a provider (%s)',
    (id) => {
      expect(getCorsPolicy(id, ORIGIN)).toBeNull();
    }
  );

  it.each(S3_PROVIDERS.map((p) => [p.id] as const))(
    'still finds the policy for a real provider id (%s) after the own-key check',
    (id) => {
      expect(getCorsPolicy(id, ORIGIN)?.text).toContain(ORIGIN);
    }
  );
});
