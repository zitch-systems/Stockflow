#!/usr/bin/env node
// ============================================================================
// tests/audit.mjs — dependency-free static analysis for the StockFlow frontend
// ============================================================================
// StockFlow is a hand-written static HTML/JS app (no build step). That makes it
// easy to ship "dead" buttons (an onclick that calls a function that no longer
// exists), duplicate element IDs, or a stray syntax error that silently breaks
// a whole <script> block. This auditor catches those whole classes of bug
// without any third-party dependency — it runs anywhere `node` is installed.
//
//   node tests/audit.mjs            # audit every page, exit 1 on any ERROR
//   node tests/audit.mjs --warn     # also print non-fatal WARNINGS
//   node tests/audit.mjs file.html  # audit a single file
//
// Checks:
//   1. JS syntax       — every inline <script> block must parse (node:vm).
//   2. Dead handlers   — every on*="name(...)" must resolve to a defined
//                        global function (or a known browser builtin).
//   3. Duplicate IDs   — no id="x" may appear twice in one document.
//   4. Dangling refs   — getElementById('literal') must match some id="literal".
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WARN = process.argv.includes('--warn');

// Pages to audit. Vendored bundles (supabase.min.js, html2canvas) are skipped —
// they're third-party minified code we don't own.
const EXPLICIT = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DEFAULT_PAGES = [
  '404.html', 'index.html', 'landing.html', 'login.html', 'signup.html',
  'forgot-password.html', 'reset-password.html',
  'rep-dashboard.html', 'manager-dashboard.html', 'owner-dashboard.html',
  'admin-dashboard.html',
];

// Browser / language globals an inline handler is allowed to call directly.
const BUILTINS = new Set([
  'alert', 'confirm', 'prompt', 'print', 'open', 'close', 'focus', 'blur',
  'scrollTo', 'scrollBy', 'setTimeout', 'setInterval', 'clearTimeout',
  'clearInterval', 'requestAnimationFrame', 'fetch', 'btoa', 'atob',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI',
  'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date',
  'RegExp', 'Map', 'Set', 'Promise', 'Error', 'Symbol', 'BigInt',
  'console', 'window', 'document', 'navigator', 'location', 'history',
  'localStorage', 'sessionStorage', 'event', 'this', 'self', 'top', 'parent',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'crypto',
]);

// Reserved words that can lead an attribute value but are never function names.
const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof',
  'void', 'delete', 'new', 'in', 'instanceof', 'do', 'else', 'try', 'throw',
  'var', 'let', 'const', 'await', 'yield', 'true', 'false', 'null', 'undefined',
]);

const HANDLER_ATTR = /\son[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi;
const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
// Static ids only: skip values built by JS (templated `${}` or concatenated `+`).
const ID_ATTR = /\bid\s*=\s*("([^"${}+']*)"|'([^'${}+"]*)')/gi;
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi;
const CALL_IDENT = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
const GETBYID = /getElementById\(\s*(["'])([^"'${}+]*)\1\s*\)/g;

let errorCount = 0;
let warnCount = 0;
const errln = (m) => { console.error('  \x1b[31m✗ ERROR\x1b[0m  ' + m); errorCount++; };
const warnln = (m) => { if (WARN) console.error('  \x1b[33m! WARN\x1b[0m   ' + m); warnCount++; };

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

// Collect every name that is reachable as a global function/var from an inline
// handler. We are deliberately generous (any definition pattern counts) so we
// only ever flag a handler whose target is defined *nowhere* — a true dead ref.
function collectDefinedNames(scripts) {
  const names = new Set();
  const add = (re, group) => {
    for (const src of scripts) {
      let m;
      const r = new RegExp(re.source, re.flags);
      while ((m = r.exec(src))) names.add(m[group]);
    }
  };
  add(/\bfunction\s+([A-Za-z_$][\w$]*)/g, 1);            // function foo(){}
  add(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g, 1);            // window.foo = ...
  add(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g, 1); // const foo = ...
  add(/\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g, 1); // foo = ()=>
  add(/\b([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function/g, 1); // foo: function
  return names;
}

// Read the source of every LOCAL <script src="..."> the page includes (so that
// shared globals like window.logout in supabase-client.js resolve correctly).
// Vendored minified bundles are skipped — handlers never call into them by name.
const VENDOR = /supabase\.min\.js|html2canvas\.min\.js|\.min\.js$/i;
function resolveLocalScripts(html) {
  const out = [];
  let m;
  const r = new RegExp(SCRIPT_SRC.source, SCRIPT_SRC.flags);
  while ((m = r.exec(html))) {
    const src = m[2] != null ? m[2] : m[3];
    if (!src || /^https?:\/\//i.test(src) || VENDOR.test(src)) continue;
    try { out.push(readFileSync(join(ROOT, src.replace(/^\//, '')), 'utf8')); } catch { /* missing include is harmless here */ }
  }
  return out;
}

// Replace <script> bodies with blank lines (line numbers preserved) so static
// markup checks don't trip over ids/attributes living inside JS template strings.
function blankScripts(html) {
  return html.replace(new RegExp(SCRIPT_BLOCK.source, SCRIPT_BLOCK.flags),
    (full, attrs, body) => '<script' + attrs + '>' + body.replace(/[^\n]/g, ' ') + '</script>');
}

// Pull the script source out of every inline <script> (no src=) block.
function extractScripts(html) {
  const blocks = [];
  let m;
  const r = new RegExp(SCRIPT_BLOCK.source, SCRIPT_BLOCK.flags);
  while ((m = r.exec(html))) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;              // external script
    if (/type\s*=\s*["'](?!text\/javascript|module|application\/javascript)/i.test(attrs)) continue; // json-ld etc.
    blocks.push({ code: m[2], start: m.index, isModule: /type\s*=\s*["']module["']/i.test(attrs) });
  }
  return blocks;
}

function checkSyntax(file, html, blocks) {
  blocks.forEach((b, i) => {
    try {
      // vm.Script parses (and compiles) without executing — perfect syntax gate.
      // eslint-disable-next-line no-new
      new vm.Script(b.code, { filename: `${file}#script[${i}]` });
    } catch (e) {
      if (b.isModule && /await is only valid|import|export/.test(e.message)) return;
      const ln = lineOf(html, b.start);
      errln(`${file}: syntax error in <script> block #${i} (near HTML line ${ln}): ${e.message}`);
    }
  });
}

function checkHandlers(file, html, defined) {
  let m;
  const r = new RegExp(HANDLER_ATTR.source, HANDLER_ATTR.flags);
  const dead = new Map(); // name -> first line
  while ((m = r.exec(html))) {
    const value = m[2] != null ? m[2] : m[3];
    let c;
    const cr = new RegExp(CALL_IDENT.source, CALL_IDENT.flags);
    while ((c = cr.exec(value))) {
      const name = c[2];
      if (KEYWORDS.has(name) || BUILTINS.has(name)) continue;
      if (defined.has(name)) continue;
      if (!dead.has(name)) dead.set(name, lineOf(html, m.index));
    }
  }
  for (const [name, ln] of dead) {
    errln(`${file}: handler calls \x1b[1m${name}()\x1b[0m which is defined nowhere (line ~${ln}) — dead button`);
  }
}

function checkDuplicateIds(file, html) {
  const seen = new Map();
  const dup = new Map();
  let m;
  const staticHtml = blankScripts(html); // ignore ids inside JS template strings
  const r = new RegExp(ID_ATTR.source, ID_ATTR.flags);
  while ((m = r.exec(staticHtml))) {
    const id = m[2] != null ? m[2] : m[3];
    if (!id) continue;
    if (seen.has(id)) {
      dup.set(id, (dup.get(id) || [seen.get(id)]).concat(lineOf(html, m.index)));
    } else {
      seen.set(id, lineOf(html, m.index));
    }
  }
  for (const [id, lines] of dup) {
    errln(`${file}: duplicate id="${id}" at lines ${lines.join(', ')} — getElementById will only find the first`);
  }
}

// Catch the "defined-but-not-exposed" bug: a function declared *inside an IIFE*
// is invoked elsewhere via window.fn(...). Because it was never assigned to
// window (and isn't a top-level `function`/`var`, which auto-create globals),
// window.fn is undefined and the call silently no-ops or throws. This is exactly
// how several owner-dashboard nav renderers (renderSlInvGrid, …) were dead.
function namesFrom(text, re, ...groups) {
  const out = new Set();
  let m; const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(text))) for (const g of groups) if (m[g]) out.add(m[g]);
  return out;
}
function checkDeadWindowCalls(file, html, includedScripts) {
  const withIncludes = html + '\n' + includedScripts.join('\n');
  const calledWin = namesFrom(html, /window\.([A-Za-z_$][\w$]*)\s*\(/g, 1);
  const winAssigned = namesFrom(withIncludes, /window\.([A-Za-z_$][\w$]*)\s*=/g, 1);
  const topLevel = namesFrom('\n' + html, /\n(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|\nvar\s+([A-Za-z_$][\w$]*)/g, 1, 2);
  const nestedFn = namesFrom('\n' + html, /\n\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, 1);
  for (const name of calledWin) {
    if (BUILTINS.has(name) || winAssigned.has(name) || topLevel.has(name)) continue;
    if (!nestedFn.has(name)) continue; // undefined optional hook, not a wiring bug
    const ln = lineOf(html, html.search(new RegExp('window\\.' + name + '\\s*\\(')));
    errln(`${file}: window.${name}() is called (line ~${ln}) but ${name} is a nested function never assigned to window — dead call`);
  }
}

function checkDanglingRefs(file, html, scripts) {
  // All static ids present anywhere in the document (incl. inside template HTML).
  const ids = new Set();
  let m;
  const r = new RegExp(ID_ATTR.source, ID_ATTR.flags);
  while ((m = r.exec(html))) {
    const id = m[2] != null ? m[2] : m[3];
    if (id) ids.add(id);
  }
  const missing = new Map();
  for (const src of scripts) {
    let g;
    const gr = new RegExp(GETBYID.source, GETBYID.flags);
    while ((g = gr.exec(src))) {
      const id = g[2];
      if (!id || ids.has(id)) continue;
      if (!missing.has(id)) missing.set(id, true);
    }
  }
  for (const id of missing.keys()) {
    warnln(`${file}: getElementById('${id}') has no matching static id="${id}" (created dynamically?)`);
  }
}

function auditFile(file) {
  const abs = join(ROOT, file);
  let html;
  try { html = readFileSync(abs, 'utf8'); }
  catch { errln(`${file}: cannot read file`); return; }

  const blocks = extractScripts(html);
  const scripts = blocks.map((b) => b.code);
  // Globals reachable from inline handlers = this page's scripts + its local includes.
  const defined = collectDefinedNames(scripts.concat(resolveLocalScripts(html)));

  const before = errorCount;
  checkSyntax(file, html, blocks);
  checkHandlers(file, html, defined);
  checkDuplicateIds(file, html);
  checkDeadWindowCalls(file, html, resolveLocalScripts(html));
  checkDanglingRefs(file, html, scripts);
  if (errorCount === before) console.log(`  \x1b[32m✓\x1b[0m ${file}  (${blocks.length} script blocks)`);
}

function main() {
  const files = EXPLICIT.length ? EXPLICIT.map(basename) : DEFAULT_PAGES;
  // Always validate the shared client too.
  console.log('\n\x1b[1mStockFlow static audit\x1b[0m\n');
  for (const f of files) auditFile(f);

  // Shared plain-JS modules — syntax-check them directly.
  if (!EXPLICIT.length) {
    for (const js of ['supabase-client.js', 'stockflow-device.js', 'service-worker.js']) {
      try {
        new vm.Script(readFileSync(join(ROOT, js), 'utf8'), { filename: js });
        console.log(`  \x1b[32m✓\x1b[0m ${js}`);
      } catch (e) {
        errln(`${js}: syntax error: ${e.message}`);
      }
    }
  }

  console.log('');
  if (errorCount) {
    console.error(`\x1b[31m${errorCount} error(s)\x1b[0m` + (warnCount ? `, ${warnCount} warning(s)` : '') + '\n');
    process.exit(1);
  }
  console.log(`\x1b[32mAll checks passed\x1b[0m` + (warnCount ? ` (${warnCount} warning(s) — run with --warn to see them)` : '') + '\n');
}

main();
