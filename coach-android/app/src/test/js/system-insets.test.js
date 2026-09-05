'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../..');
const css = fs.readFileSync(path.join(root, 'app/src/main/assets/www/css/app.css'), 'utf8');
const activity = fs.readFileSync(path.join(root, 'app/src/main/java/com/coach/app/MainActivity.kt'), 'utf8');

for (const edge of ['left', 'top', 'right', 'bottom']) {
  assert.match(activity, new RegExp('--android-inset-' + edge), 'native inset missing: ' + edge);
  assert.match(css, new RegExp('--android-inset-' + edge), 'CSS inset missing: ' + edge);
}
assert.doesNotMatch(activity, /view\.setPadding\(system\./,
  'WebView padding does not move fixed CSS controls and must not be the sole inset mechanism');
assert.match(css, /\.bottom-nav[\s\S]*padding:[^;]*var\(--android-inset-bottom\)/,
  'bottom navigation controls must sit above the Android navigation area');
assert.match(css, /main \{[^}]*var\(--android-inset-bottom\)/,
  'scrolling content must clear the enlarged bottom navigation');
assert.match(css, /\.topbar[\s\S]*var\(--android-inset-top\)/,
  'header must clear the Android status bar');
assert.match(css, /\.bottom-nav button \{ min-height: 55px;/,
  'bottom tabs must keep a large touch target');

console.log('system-insets.test.js: OK');
