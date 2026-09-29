// 后台 SPA 没有构建步骤：语法错误会让整页空白。npm run check 覆盖了 admin/，
// 这里让 `npm test` 也兜住同一件事（合并冲突最容易留下重复的 const 声明）。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

test('every admin script parses', () => {
  const files = readdirSync(join(root, 'admin')).filter((name) => /\.m?js$/.test(name));
  assert.ok(files.length > 0, 'admin directory has scripts');
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', join(root, 'admin', file)], { stdio: 'pipe' });
    } catch (error) {
      assert.fail(`admin/${file} fails to parse:\n${error.stderr}`);
    }
  }
});
