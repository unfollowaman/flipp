const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function getAllHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        getAllHtmlFiles(filePath, fileList);
      }
    } else if (file.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

test('Navbar Give feedback button test', async (t) => {
  const rootDir = path.resolve(__dirname, '..');
  const htmlFiles = getAllHtmlFiles(rootDir);
  let checkedCount = 0;

  for (const file of htmlFiles) {
    const relativePath = path.relative(rootDir, file);
    const content = fs.readFileSync(file, 'utf8');

    if (content.includes('class="nav-end"')) {
      checkedCount++;
      await t.test(`check ${relativePath}`, () => {
        assert.ok(
          content.includes('class="feedback-btn"'),
          `${relativePath} should contain class="feedback-btn"`
        );
        assert.ok(
          content.includes('class="github-star-btn"'),
          `${relativePath} should contain class="github-star-btn"`
        );

        const feedbackPos = content.indexOf('class="feedback-btn"');
        const starPos = content.indexOf('class="github-star-btn"');

        assert.ok(
          feedbackPos < starPos,
          `${relativePath}: .feedback-btn should appear before .github-star-btn`
        );

        assert.ok(
          content.includes('Give feedback'),
          `${relativePath} should contain 'Give feedback' text`
        );

        assert.ok(
          content.includes('mailto:idontknowaman@gmail.com?subject=Flipp%20Feedback'),
          `${relativePath} should contain feedback mailto link`
        );

        assert.ok(
          content.includes('thumbs-up-down.png'),
          `${relativePath} should reference thumbs-up-down.png icon`
        );
      });
    }
  }

  assert.ok(checkedCount > 0, 'Should have checked at least 1 page with .nav-end');
});
