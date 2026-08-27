import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const manifest = require('../package.json');
const [report] = JSON.parse(
	execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
		encoding: 'utf8',
		env: {
			...process.env,
			npm_config_cache: join(tmpdir(), 'assinafy-sdk-npm-cache'),
		},
	}),
);
const paths = report.files.map(({ path }) => path);
const required = [
	...manifest.n8n.credentials,
	...manifest.n8n.nodes,
	'docs/OPERATIONS.md',
	'CHANGELOG.md',
	'CONTRIBUTING.md',
	'LICENSE.md',
	'README.md',
	'SECURITY.md',
];
const missing = required.filter((path) => !paths.includes(path));
const leakedGeneratedFiles = paths.filter(
	(path) => path.endsWith('.tsbuildinfo') || path.startsWith('dist/coverage/'),
);

if (missing.length || leakedGeneratedFiles.length) {
	throw new Error(JSON.stringify({ missing, leakedGeneratedFiles }));
}
for (const modulePath of [...manifest.n8n.credentials, ...manifest.n8n.nodes]) {
	require(`../${modulePath}`);
}
