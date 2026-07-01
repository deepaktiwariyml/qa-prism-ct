import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AUTOMATION_CONFIG, TEST_FILE_RE } from './config.js';

export interface Discovered {
  testFiles: string[];
  reportFiles: string[];
}

/**
 * Walk a repo (bounded) collecting test source files and JUnit-style XML report
 * files. Skips vendored/build directories and never throws.
 */
export function discover(repoPath: string): Discovered {
  const testFiles: string[] = [];
  const reportFiles: string[] = [];
  let count = 0;

  const walk = (dir: string): void => {
    if (count >= AUTOMATION_CONFIG.maxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (count >= AUTOMATION_CONFIG.maxFiles) return;
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (!AUTOMATION_CONFIG.ignoreDirs.has(name)) walk(full);
        continue;
      }
      count += 1;
      if (TEST_FILE_RE.test(name)) {
        testFiles.push(full);
      } else if (name.toLowerCase().endsWith('.xml') && looksLikeJUnit(full)) {
        reportFiles.push(full);
      }
    }
  };

  walk(repoPath);
  return { testFiles, reportFiles };
}

function looksLikeJUnit(path: string): boolean {
  try {
    return readFileSync(path, 'utf8').includes('<testsuite');
  } catch {
    return false;
  }
}
