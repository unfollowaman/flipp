const fs = require('fs');
const assert = require('assert');
const path = require('path');

// 1. Extract the functions from the source files
const pdfProtectFile = path.join(__dirname, 'js/pdf-protect.js');
const pdfProtectContent = fs.readFileSync(pdfProtectFile, 'utf8');

const validatePasswordsMatch = pdfProtectContent.match(/function validatePasswords\(\) \{[\s\S]*?\n\}/);
if (!validatePasswordsMatch) {
  console.error("Could not find validatePasswords function in pdf-protect.js");
  process.exit(1);
}
// We will evaluate this inside the test function where DOM variables are mocked

const pdfToImgFile = path.join(__dirname, 'js/pdf-to-img.js');
const pdfToImgContent = fs.readFileSync(pdfToImgFile, 'utf8');

const parsePageRangeMatch = pdfToImgContent.match(/function parsePageRange\(rangeStr, total\) \{[\s\S]*?\n\}/);
if (!parsePageRangeMatch) {
  console.error("Could not find parsePageRange function in pdf-to-img.js");
  process.exit(1);
}
eval(parsePageRangeMatch[0]);

const dragDropFile = path.join(__dirname, 'js/drag-drop.js');
const dragDropContent = fs.readFileSync(dragDropFile, 'utf8');

// drag-drop.js uses "export function", we can extract just the "function..." part
const setProgressMatch = dragDropContent.match(/function setProgress\(barEl, labelEl, value, label\) \{[\s\S]*?\n\}/);
if (!setProgressMatch) {
  console.error("Could not find setProgress function in drag-drop.js");
  process.exit(1);
}
eval(setProgressMatch[0]);

// 2. Define our test cases
const testCases = [
  // Format: [description, inputRangeStr, totalPages, expectedOutputArray]

  // Happy paths
  ['Single page', '1', 10, [1]],
  ['Multiple single pages', '1, 3, 5', 10, [1, 3, 5]],
  ['Simple range', '1-3', 10, [1, 2, 3]],
  ['Mixed range and singles', '1, 3-5, 8', 10, [1, 3, 4, 5, 8]],

  // Spacing edge cases
  ['No spaces', '1,2-4,6', 10, [1, 2, 3, 4, 6]],
  ['Lots of spaces', '  1  ,  3 -  5 , 8  ', 10, [1, 3, 4, 5, 8]],

  // Overlapping and ordering
  ['Overlapping ranges', '1-5, 3-7', 10, [1, 2, 3, 4, 5, 6, 7]],
  ['Out of order input', '8, 1-3, 5', 10, [1, 2, 3, 5, 8]],

  // Bounds checking
  ['Range exceeding total', '8-15', 10, [8, 9, 10]],
  ['Single page exceeding total', '15', 10, []],

  // Error / Invalid input
  ['Empty string', '', 10, []],
  ['Letters and garbage', 'a, b-c, 1', 10, [1]]
];

// 3. Define validatePasswords test cases
function testValidatePasswords() {
  console.log("\n🧪 Running validatePasswords Tests\n");
  let p = 0;
  let f = 0;

  // Mock global showToast function
  let lastToastMessage = null;
  let lastToastType = null;
  global.showToast = function(message, type) {
    lastToastMessage = message;
    lastToastType = type;
  };

  // Mock DOM elements
  const passwordEl = { value: '' };
  const confirmPasswordEl = { value: '' };

  // Evaluate the function in the current scope so it has access to mocked globals
  const validatePasswords = new Function('passwordEl', 'confirmPasswordEl', 'showToast', `
    ${validatePasswordsMatch[0]}
    return validatePasswords();
  `);

  // Helper to run a test case
  function runTest(desc, p1, p2, expectedReturn, expectedToast) {
    passwordEl.value = p1;
    confirmPasswordEl.value = p2;
    lastToastMessage = null;
    lastToastType = null;

    try {
      const result = validatePasswords(passwordEl, confirmPasswordEl, global.showToast);
      assert.strictEqual(result, expectedReturn);
      if (expectedToast) {
        assert.strictEqual(lastToastMessage, expectedToast);
      } else {
        assert.strictEqual(lastToastMessage, null);
      }
      console.log(`✅ PASS: ${desc}`);
      p++;
    } catch (err) {
      console.error(`❌ FAIL: ${desc}`);
      console.error(`   Error: ${err.message}`);
      f++;
    }
  }

  // Happy paths
  runTest('Valid matching passwords', 'secret', 'secret', 'secret', null);
  runTest('Whitespace is trimmed', '  secret  ', 'secret', 'secret', null);
  runTest('Both trimmed correctly', ' secret ', '  secret  ', 'secret', null);

  // Error cases
  runTest('Password too short', '123', '123', null, 'Password must be at least 4 characters.');
  runTest('Password too short (after trim)', '123  ', '123  ', null, 'Password must be at least 4 characters.');
  runTest('Passwords do not match', 'secret', 'different', null, 'Passwords do not match.');

  return { passed: p, failed: f };
}

// 4. Define setProgress test cases
// We'll write a simple test runner function for this
function testSetProgress() {
  console.log("\n🧪 Running setProgress Tests\n");
  let p = 0;
  let f = 0;

  const cases = [
    {
      desc: 'Updates width and label correctly',
      value: 50,
      label: 'Loading...',
      withLabelEl: true,
      expectedWidth: '50%',
      expectedText: 'Loading...'
    },
    {
      desc: 'Handles 0 correctly',
      value: 0,
      label: 'Start',
      withLabelEl: true,
      expectedWidth: '0%',
      expectedText: 'Start'
    },
    {
      desc: 'Handles 100 correctly',
      value: 100,
      label: 'Complete',
      withLabelEl: true,
      expectedWidth: '100%',
      expectedText: 'Complete'
    },
    {
      desc: 'Works without labelEl',
      value: 75,
      label: 'Ignoring this',
      withLabelEl: false,
      expectedWidth: '75%',
      expectedText: undefined // Not updated
    }
  ];

  for (const c of cases) {
    const barEl = { style: {} };
    const labelEl = c.withLabelEl ? { textContent: '' } : null;

    try {
      setProgress(barEl, labelEl, c.value, c.label);
      assert.strictEqual(barEl.style.width, c.expectedWidth);
      if (c.withLabelEl) {
        assert.strictEqual(labelEl.textContent, c.expectedText);
      }
      console.log(`✅ PASS: ${c.desc}`);
      p++;
    } catch (err) {
      console.error(`❌ FAIL: ${c.desc}`);
      console.error(`   Error: ${err.message}`);
      f++;
    }
  }
  return { passed: p, failed: f };
}


// Run tests
let passed = 0;
let failed = 0;

console.log("🧪 Running parsePageRange Tests\n");

for (const [desc, input, total, expected] of testCases) {
  try {
    const result = parsePageRange(input, total);
    assert.deepStrictEqual(result, expected);
    console.log(`✅ PASS: ${desc} ("${input}", total: ${total}) -> [${result}]`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${desc} ("${input}", total: ${total})`);
    console.error(`   Expected: [${expected}]`);

    let actual;
    try {
       actual = parsePageRange(input, total);
    } catch (e) {
       actual = `Error thrown: ${e.message}`;
    }
    console.error(`   Actual:   [${actual}]`);
    failed++;
  }
}

const validatePasswordsResults = testValidatePasswords();
passed += validatePasswordsResults.passed;
failed += validatePasswordsResults.failed;

const setProgressResults = testSetProgress();
passed += setProgressResults.passed;
failed += setProgressResults.failed;

console.log(`\nTotal Results: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 All tests passed!");
}
