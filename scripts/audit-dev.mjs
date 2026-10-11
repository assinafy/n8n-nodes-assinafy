import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const policy = JSON.parse(readFileSync(new URL('./audit-dev-exceptions.json', import.meta.url)));

function verify(report, lock, today = new Date().toISOString().slice(0, 10)) {
	if (report.error || !report.vulnerabilities)
		throw new Error('npm audit did not return a valid report');
	for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
		if (!['high', 'critical'].includes(vulnerability.severity)) continue;
		if (
			!vulnerability.nodes.length ||
			vulnerability.nodes.some((path) => !lock.packages[path]?.dev)
		) {
			throw new Error(`Production dependency cannot receive a development exception: ${name}`);
		}
		for (const advisory of vulnerability.via) {
			if (typeof advisory === 'string' || !['high', 'critical'].includes(advisory.severity))
				continue;
			const id = advisory.url.split('/').at(-1);
			const rule = advisory.severity === 'critical' ? policy.critical : policy;
			if (!rule || today >= rule.expires || !rule.advisories[name]?.includes(id)) {
				throw new Error(`Unaccepted or expired advisory: ${name} ${id}`);
			}
			console.warn(`Development exception until ${rule.expires}: ${name} ${id}`);
		}
	}
}

if (process.argv.includes('--self-test')) {
	const id = policy.advisories.axios[0];
	const report = {
		vulnerabilities: {
			axios: {
				severity: 'high',
				nodes: ['node_modules/axios'],
				via: [{ severity: 'high', url: `https://github.com/advisories/${id}` }],
			},
		},
	};
	const lock = { packages: { 'node_modules/axios': { dev: true } } };
	verify(report, lock, '2026-10-05');
	assert.throws(() => verify(report, { packages: {} }, '2026-10-05'), /Production dependency/);
	assert.throws(() => verify(report, lock, policy.expires), /expired advisory/);
	report.vulnerabilities.axios.via[0].url = 'https://github.com/advisories/GHSA-unlisted';
	assert.throws(() => verify(report, lock, '2026-10-05'), /Unaccepted/);
	report.vulnerabilities.axios.via[0] = {
		severity: 'critical',
		url: `https://github.com/advisories/${id}`,
	};
	assert.throws(() => verify(report, lock, '2026-10-05'), /Unaccepted/);
	const [criticalName, [criticalId]] = Object.entries(policy.critical.advisories)[0];
	const critical = {
		vulnerabilities: {
			[criticalName]: {
				severity: 'critical',
				nodes: [`node_modules/${criticalName}`],
				via: [{ severity: 'critical', url: `https://github.com/advisories/${criticalId}` }],
			},
		},
	};
	const criticalLock = { packages: { [`node_modules/${criticalName}`]: { dev: true } } };
	verify(critical, criticalLock, '2026-10-11');
	assert.throws(() => verify(critical, criticalLock, policy.critical.expires), /expired advisory/);
	assert.throws(() => verify(critical, { packages: {} }, '2026-10-11'), /Production dependency/);
	console.log('Development audit exception checks passed');
} else {
	const result = spawnSync('npm', ['audit', '--json'], {
		encoding: 'utf8',
		shell: process.platform === 'win32',
	});
	if (![0, 1].includes(result.status)) throw new Error(result.stderr || 'npm audit failed');
	const report = JSON.parse(result.stdout);
	console.log(JSON.stringify(report.metadata.vulnerabilities));
	verify(report, JSON.parse(readFileSync('package-lock.json')));
}
