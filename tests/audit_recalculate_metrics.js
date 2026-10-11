const fs = require('fs');
const path = require('path');

function auditAllJsonArtifacts() {
  const jsonFiles = fs.readdirSync(__dirname).filter((f) => f.endsWith('.json'));
  console.log(`Found ${jsonFiles.length} JSON artifacts in tests/\n`);

  const summary = [];

  jsonFiles.forEach((file) => {
    const filePath = path.join(__dirname, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (data.pageResults) {
      const pageCount = data.pageResults.length;
      const totalTimeSec = data.totalTimeMs ? (data.totalTimeMs / 1000).toFixed(1) : 'N/A';
      const avgOcrSec = data.avgOcrTimePerPageMs ? (data.avgOcrTimePerPageMs / 1000).toFixed(2) : 'N/A';
      const totalChars = data.pageResults.reduce((acc, p) => acc + (p.textLength || p.rawText?.length || 0), 0);
      const totalDevTokens = data.pageResults.reduce((acc, p) => acc + (p.devanagariTokens || 0), 0);
      const avgShortTokenRatio = (
        data.pageResults.reduce((acc, p) => acc + (p.shortTokenRatio || 0), 0) / pageCount
      ) * 100;

      let ger = 0, of = 0, bl = 0, num885 = 0, num1885 = 0;
      data.pageResults.forEach((p) => {
        if (p.corruptionPatterns) {
          ger += p.corruptionPatterns.gerCount || 0;
          of += p.corruptionPatterns.ofCount || 0;
          bl += p.corruptionPatterns.blCount || 0;
          num885 += p.corruptionPatterns.num885Count || 0;
          num1885 += p.corruptionPatterns.num1885Count || 0;
        }
      });

      summary.push({
        file,
        expName: data.config?.expName || file,
        pageCount,
        totalTimeSec: `${totalTimeSec}s`,
        avgOcrSec: `${avgOcrSec}s`,
        totalChars,
        shortTokenRatio: `${avgShortTokenRatio.toFixed(1)}%`,
        ger,
        of,
        bl,
        num885,
        num1885
      });
    } else {
      summary.push({
        file,
        expName: data.experiment || file,
        specialData: Object.keys(data).join(', ')
      });
    }
  });

  console.table(summary);
  fs.writeFileSync(
    path.join(__dirname, 'audit_metrics_recalculation.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log('\nSaved audit_metrics_recalculation.json');
}

if (require.main === module) {
  auditAllJsonArtifacts();
}

module.exports = { auditAllJsonArtifacts };
