/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	testMatch: ['**/*.test.ts'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	collectCoverageFrom: [
		'nodes/**/*.ts',
		'credentials/**/*.ts',
		'!**/*.test.ts',
	],
	coverageDirectory: 'coverage',
	// Floors set below current coverage (~80% statements) to catch regressions
	// without being brittle. Raise over time as coverage grows.
	coverageThreshold: {
		global: {
			statements: 75,
			branches: 50,
			functions: 80,
			lines: 75,
		},
	},
	verbose: true,
};