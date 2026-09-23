import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run the official scanner outside the project dependency tree; the selected release passes strict peers.
const scannerPath = process.env.PATH.split(delimiter)
	.map((entry) => join(entry, '..', '@n8n', 'scan-community-package', 'scanner', 'scanner.mjs'))
	.find(existsSync);
if (!scannerPath) throw new Error('Run this check through npm run verify:package');
const { analyzePackage, SOURCE_FILE_PATTERNS } = await import(pathToFileURL(scannerPath).href);

const require = createRequire(import.meta.url);
const manifest = require('../package.json');
// npm <= 10 reports an array of tarballs; npm 11 keys the same objects by package name.
const packed = JSON.parse(
	execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
		encoding: 'utf8',
		env: {
			...process.env,
			npm_config_cache: join(tmpdir(), 'assinafy-sdk-npm-cache'),
		},
	}),
);
const [report] = Array.isArray(packed) ? packed : Object.values(packed);
const paths = report.files.map(({ path }) => path);
const required = [
	...manifest.n8n.credentials,
	...manifest.n8n.nodes,
	'docs/OPERATIONS.md',
	'CHANGELOG.md',
	'CONTRIBUTING.md',
	'LICENSE.md',
	'README.md',
	'README.en.md',
	'README.pt-BR.md',
	'SECURITY.md',
];
const missing = required.filter((path) => !paths.includes(path));
const leakedGeneratedFiles = paths.filter(
	(path) =>
		path.endsWith('.tsbuildinfo') ||
		/(^|\/)(coverage|\.local|\.env(?:\.[^/]*)?|AGENTS\.md|CLAUDE\.md)(\/|$)/.test(path),
);

if (missing.length || leakedGeneratedFiles.length) {
	throw new Error(JSON.stringify({ missing, leakedGeneratedFiles }));
}
for (const modulePath of [...manifest.n8n.credentials, ...manifest.n8n.nodes]) {
	require(`../${modulePath}`);
}

const sourceScan = await analyzePackage(process.cwd(), SOURCE_FILE_PATTERNS);
if (!sourceScan.passed) {
	throw new Error(`Source package scan failed: ${sourceScan.details ?? sourceScan.message}`);
}

const packageDir = mkdtempSync(join(tmpdir(), 'assinafy-package-'));
try {
	const tarballs = JSON.parse(
		execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packageDir], {
			encoding: 'utf8',
		}),
	);
	const [tarball] = Array.isArray(tarballs) ? tarballs : Object.values(tarballs);
	const extracted = join(packageDir, 'extracted');
	mkdirSync(extracted);
	execFileSync('tar', ['-xzf', join(packageDir, tarball.filename), '-C', extracted, '--strip-components=1']);
	const compiledScan = await analyzePackage(extracted, ['**/*.js', 'package.json']);
	if (!compiledScan.passed) {
		throw new Error(`Compiled package scan failed: ${compiledScan.details ?? compiledScan.message}`);
	}
} finally {
	rmSync(packageDir, { recursive: true, force: true });
}
