/**
 * Velora 正式单元测试执行器
 * 自动发现并串联运行 tests/*.test.cjs，统计每套用例耗时与通过率
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = __dirname;
const rootDir = path.resolve(testsDir, '..');
const tmpBaseDir = path.join(rootDir, 'tmp');

const files = fs
  .readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.cjs'))
  .sort();

if (files.length === 0) {
  console.error('[tests] 未发现任何 *.test.cjs 测试文件');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const startedAt = Date.now();

for (const file of files) {
  const fullPath = path.join(testsDir, file);
  const t0 = Date.now();
  console.log(`\n=== Running tests/${file} ===`);
  const res = spawnSync(process.execPath, [fullPath], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  const elapsed = Date.now() - t0;
  if (res.status === 0) {
    passed++;
    console.log(`[OK] tests/${file} (${elapsed}ms)`);
  } else {
    failed++;
    console.error(`[FAIL] tests/${file} exited with code ${res.status ?? 1} (${elapsed}ms)`);
  }
}

try {
  if (fs.existsSync(tmpBaseDir) && fs.readdirSync(tmpBaseDir).length === 0) {
    fs.rmdirSync(tmpBaseDir);
  }
} catch {}

const totalElapsed = Date.now() - startedAt;
console.log(`\n----------------------------------------`);
console.log(`Test Suites: ${passed} passed, ${failed} failed, ${files.length} total (${totalElapsed}ms)`);
console.log(`----------------------------------------`);

if (failed > 0) {
  process.exit(1);
}
