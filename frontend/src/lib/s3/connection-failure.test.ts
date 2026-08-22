/**
 * The classifier exists so that four different fixes do not arrive as one
 * message, so these are mostly about the boundaries between kinds rather than
 * the wording of any one of them.
 */

import { describe, expect, it } from 'vitest';
import { classifyConnectionFailure } from './connection-failure';

/** An error the way the AWS SDK hands one back. */
function sdkError(name: string, httpStatusCode?: number) {
  const error = new Error(`${name} was returned`);
  error.name = name;

  return Object.assign(error, { $metadata: { httpStatusCode } });
}

describe('credentials', () => {
  it.each(['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'ExpiredToken'])(
    'reads %s as a key problem',
    (name) => {
      expect(classifyConnectionFailure(sdkError(name, 403)).kind).toBe('credentials');
    }
  );

  // Retrying an unchanged wrong key just fails again, and a retry button that
  // cannot work is worse than not offering one.
  it('is not retryable', () => {
    expect(classifyConnectionFailure(sdkError('SignatureDoesNotMatch', 403)).retryable).toBe(false);
  });
});

describe('permissions', () => {
  it('reads AccessDenied as a policy problem, not a key problem', () => {
    expect(classifyConnectionFailure(sdkError('AccessDenied', 403)).kind).toBe('permissions');
  });

  // The key is real either way; what differs is where the user goes to fix it.
  it('separates a rejected key from a refused request', () => {
    const rejected = classifyConnectionFailure(sdkError('InvalidAccessKeyId', 403));
    const refused = classifyConnectionFailure(sdkError('AccessDenied', 403));

    expect(rejected.kind).not.toBe(refused.kind);
  });

  it('falls back to 403 when the name means nothing to us', () => {
    expect(classifyConnectionFailure(sdkError('SomethingNew', 403)).kind).toBe('permissions');
  });
});

describe('bucket', () => {
  it('reads NoSuchBucket as a missing bucket', () => {
    expect(classifyConnectionFailure(sdkError('NoSuchBucket', 404)).kind).toBe('bucket');
  });

  // A bucket in the wrong region answers with a redirect rather than a 404,
  // and the fix is the same: correct the region.
  it('reads PermanentRedirect as a missing bucket too', () => {
    expect(classifyConnectionFailure(sdkError('PermanentRedirect', 301)).kind).toBe('bucket');
  });
});

describe('network', () => {
  // What a CORS rejection actually looks like from a browser: a TypeError with
  // no status and no body. Chrome, Firefox and Safari each word it differently.
  it.each(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'])(
    'reads %s as a network failure',
    (message) => {
      const error = new TypeError(message);

      expect(classifyConnectionFailure(error).kind).toBe('network');
    }
  );

  it('names CORS, since that is the usual cause in a browser', () => {
    expect(classifyConnectionFailure(new TypeError('Failed to fetch')).detail).toMatch(/CORS/);
  });

  it('is retryable, because a dropped connection looks the same', () => {
    expect(classifyConnectionFailure(new TypeError('Failed to fetch')).retryable).toBe(true);
  });

  // A TypeError carrying a status came from the service, not the transport.
  it('does not claim a network failure when the service answered', () => {
    expect(classifyConnectionFailure(sdkError('TypeError', 403)).kind).not.toBe('network');
  });
});

describe('unknown', () => {
  it('says so rather than guessing', () => {
    expect(classifyConnectionFailure(sdkError('WeirdInternalThing', 500)).kind).toBe('unknown');
  });

  it('stays retryable, since an unrecognised failure may be transient', () => {
    expect(classifyConnectionFailure(sdkError('WeirdInternalThing', 500)).retryable).toBe(true);
  });
});

describe('whatever actually gets thrown', () => {
  // Nothing guarantees a throw is an Error, and the classifier runs inside a
  // catch. Throwing from the error handler would replace a message the user
  // could act on with a blank screen.
  it.each([null, undefined, 'a string', 42, {}, []])('survives %p', (thrown) => {
    expect(() => classifyConnectionFailure(thrown)).not.toThrow();
    expect(classifyConnectionFailure(thrown).kind).toBe('unknown');
  });

  it('keeps the original throw for logging', () => {
    const original = sdkError('AccessDenied', 403);

    expect(classifyConnectionFailure(original).cause).toBe(original);
  });

  it('always produces something renderable', () => {
    const failure = classifyConnectionFailure(null);

    expect(failure.title.length).toBeGreaterThan(0);
    expect(failure.detail.length).toBeGreaterThan(0);
  });
});
