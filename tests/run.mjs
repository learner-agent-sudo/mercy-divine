// 依序執行 tests/ 內的各項測試，並在期間自動啟動本機伺服器。
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';

const PORT = Number(process.env.PORT || 8765);
const root = new URL('..', import.meta.url).pathname;
const only = process.argv[2];

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const suites = readdirSync(new URL('.', import.meta.url))
  .filter((f) => f.endsWith('.mjs') && !['run.mjs', 'helpers.mjs'].includes(f))
  .filter((f) => !only || f.includes(only))
  .sort();

const results = [];
for (const suite of suites) {
  console.log(`\n\x1b[1m── ${suite} ${'─'.repeat(Math.max(0, 56 - suite.length))}\x1b[0m`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [`tests/${suite}`], {
      cwd: root, stdio: 'inherit', env: { ...process.env, BASE_URL: `http://localhost:${PORT}/` },
    });
    child.on('exit', resolve);
  });
  results.push({ suite, ok: code === 0 });
}

server.kill();
const failed = results.filter((r) => !r.ok);
console.log('\n' + '═'.repeat(60));
for (const r of results) console.log(`${r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${r.suite}`);
console.log(`${results.length - failed.length}/${results.length} suites passed`);
process.exit(failed.length ? 1 : 0);
