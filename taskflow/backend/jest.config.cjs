/**
 * Explicit Jest config to ensure `ts-jest` preset is used and
 * that rootDir/resolution behave consistently when running tests.
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.(t|j)s$': require.resolve('ts-jest/dist'),
  },
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
};
