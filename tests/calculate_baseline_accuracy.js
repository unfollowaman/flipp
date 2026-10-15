const fs = require('fs');
const path = require('path');
const { calculateCER, calculateWER, extractMatchingSubsegment } = require('./accuracy_metrics.js');
const { REFERENCE_PASSAGES } = require('./reference_passages.js');

function evaluateBaselineAccuracy() {
  console.log('\n--- Phase 3 Current Baseline Accuracy Evaluation ---');

  let fullDownloadedText = '';
  const testTxtPath = path.resolve(__dirname, 'test.txt');
  if (fs.existsSync(testTxtPath)) {
    fullDownloadedText = fs.readFileSync(testTxtPath, 'utf8');
  } else {
    throw new Error(`test.txt not found at ${testTxtPath}`);
  }

  const results = [];
  let totalRefChars = 0;
  let totalErrChars = 0;
  let totalRefWords = 0;
  let totalErrWords = 0;

  for (const passage of REFERENCE_PASSAGES) {
    const extractedSegment = extractMatchingSubsegment(
      passage.text,
      fullDownloadedText,
      passage.startKeyword,
      passage.endKeyword
    );

    const cerRes = calculateCER(passage.text, extractedSegment);
    const werRes = calculateWER(passage.text, extractedSegment);

    results.push({
      id: passage.id,
      pageNumber: passage.pageNumber,
      cer: cerRes.cer,
      wer: werRes.wer,
      refLength: cerRes.refLength,
      distanceChars: cerRes.distance,
      refWords: werRes.refWordsCount,
      distanceWords: werRes.distance,
      extractedSnippet: extractedSegment.substring(0, 100) + '...',
    });

    totalRefChars += cerRes.refLength;
    totalErrChars += cerRes.distance;
    totalRefWords += werRes.refWordsCount;
    totalErrWords += werRes.distance;
  }

  const overallCER = totalRefChars > 0 ? totalErrChars / totalRefChars : 0;
  const overallWER = totalRefWords > 0 ? totalErrWords / totalRefWords : 0;

  const baselineSummary = {
    overallCER,
    overallWER,
    totalRefChars,
    totalErrChars,
    totalRefWords,
    totalErrWords,
    passageResults: results,
  };

  console.log(`Overall Reference Passages CER: ${(overallCER * 100).toFixed(2)}% (${totalErrChars}/${totalRefChars} char errors)`);
  console.log(`Overall Reference Passages WER: ${(overallWER * 100).toFixed(2)}% (${totalErrWords}/${totalRefWords} word errors)`);

  fs.writeFileSync(
    path.resolve(__dirname, 'phase3_baseline_accuracy_metrics.json'),
    JSON.stringify(baselineSummary, null, 2)
  );
  console.log('Saved phase3_baseline_accuracy_metrics.json\n');

  return baselineSummary;
}

if (require.main === module) {
  evaluateBaselineAccuracy();
}

module.exports = { evaluateBaselineAccuracy };
