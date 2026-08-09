/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	testMatch: ['**/*.test.ts'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	collectCoverageFrom: ['nodes/**/*.ts', 'credentials/**/*.ts', '!**/*.test.ts'],
	// Keep generated reports under dist, which the strict n8n ESLint preset ignores.
	coverageDirectory: 'dist/coverage',
	// Keep a small buffer below the verified baseline so dependency-level
	// instrumentation changes do not make the gate brittle.
	coverageThreshold: {
		global: {
			statements: 85,
			branches: 65,
			functions: 95,
			lines: 85,
		},
	},
	verbose: true,
};
