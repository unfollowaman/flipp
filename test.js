const fs = require('fs');
const assert = require('assert');
const path = require('path');

// 1. Extract the function from the source file
const sourceFile = path.join(__dirname, 'js/pdf-to-img.js');
const fileContent = fs.readFileSync(sourceFile, 'utf8');

// Find the function definition
const functionMatch = fileContent.match(/function parsePageRange\(rangeStr, total\) \{[\s\S]*?\n\}/);

if (!functionMatch) {
  console.error("Could not find parsePageRange function in pdf-to-img.js");
  process.exit(1);
}

const functionCode = functionMatch[0];

// Evaluate the function code in the current context
// This makes `parsePageRange` available in this script
eval(functionCode);

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

console.log(`\nResults: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 All tests passed!");
}
