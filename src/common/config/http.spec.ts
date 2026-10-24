import { isSwaggerEnabled, trustProxySetting } from './http';

describe('http config', () => {
  it.each([
    [{ NODE_ENV: 'development' }, true],
    [{ NODE_ENV: 'production' }, false],
    [{ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }, true],
    [{ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }, false],
  ])('isSwaggerEnabled(%o) → %s', (env, expected) => {
    expect(isSwaggerEnabled(env)).toBe(expected);
  });

  it.each([
    [undefined, undefined],
    ['', undefined],
    ['1', 1],
    ['true', true],
    ['false', false],
    ['abc', undefined],
  ])('trustProxySetting(%s) → %s', (value, expected) => {
    expect(trustProxySetting(value)).toBe(expected);
  });
});
