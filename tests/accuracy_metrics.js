/**
 * Utility functions for calculating Character Error Rate (CER) and
 * Word Error Rate (WER) using Levenshtein Edit Distance.
 */

function levenshteinDistance(arr1, arr2) {
  const m = arr1.length;
  const n = arr2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return {
    distance: dp[m][n],
  };
}

function normalizeText(text) {
  if (!text) return "";
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateCER(reference, hypothesis) {
  const refNorm = normalizeText(reference);
  const hypNorm = normalizeText(hypothesis);

  if (refNorm.length === 0) return { cer: 0, refLength: 0, distance: 0 };

  const refChars = Array.from(refNorm);
  const hypChars = Array.from(hypNorm);
  const res = levenshteinDistance(refChars, hypChars);

  return {
    cer: res.distance / refChars.length,
    distance: res.distance,
    refLength: refChars.length,
    hypLength: hypChars.length,
  };
}

function calculateWER(reference, hypothesis) {
  const refNorm = normalizeText(reference);
  const hypNorm = normalizeText(hypothesis);

  const refWords = refNorm.split(/\s+/).filter(Boolean);
  const hypWords = hypNorm.split(/\s+/).filter(Boolean);

  if (refWords.length === 0) return { wer: 0, refWordsCount: 0, distance: 0 };

  const res = levenshteinDistance(refWords, hypWords);

  return {
    wer: res.distance / refWords.length,
    distance: res.distance,
    refWordsCount: refWords.length,
    hypWordsCount: hypWords.length,
  };
}

function extractMatchingSubsegment(reference, fullPageText, startKeyword, endKeyword) {
  if (!fullPageText) return "";
  const normPage = normalizeText(fullPageText);
  const normRef = normalizeText(reference);

  let startIndex = 0;

  if (startKeyword) {
    const idx = normPage.indexOf(startKeyword);
    if (idx !== -1) {
      startIndex = idx;
    } else {
      // Fallback: search for first 15 chars of startKeyword
      const shortKw = startKeyword.substring(0, 15);
      const idx2 = normPage.indexOf(shortKw);
      if (idx2 !== -1) startIndex = idx2;
    }
  }

  let endIndex = startIndex + normRef.length + 40;

  if (endKeyword) {
    const idx = normPage.indexOf(endKeyword, startIndex);
    if (idx !== -1 && idx - startIndex < normRef.length * 1.5) {
      endIndex = idx + endKeyword.length;
    }
  }

  return normPage.substring(startIndex, Math.min(normPage.length, endIndex));
}

module.exports = {
  levenshteinDistance,
  normalizeText,
  calculateCER,
  calculateWER,
  extractMatchingSubsegment,
};
