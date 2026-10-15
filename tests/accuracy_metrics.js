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
  return String(text)
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

function extractMatchingSubsegment(reference, fullDownloadedText, pageNumber, startKeyword, endKeyword) {
  if (!fullDownloadedText) return "";

  const normPage = normalizeText(fullDownloadedText);
  const normRef = normalizeText(reference);

  let startIndex = -1;

  if (startKeyword) {
    const kwStr = String(startKeyword);
    startIndex = normPage.indexOf(kwStr);
    if (startIndex === -1) {
      // Fallback: search for first 12 characters of startKeyword
      const shortKw = kwStr.substring(0, Math.min(12, kwStr.length));
      startIndex = normPage.indexOf(shortKw);
    }
  }

  if (startIndex === -1) {
    // If start keyword not found at all, try searching first word of reference
    const firstWord = normRef.split(" ")[0];
    if (firstWord && firstWord.length > 3) {
      startIndex = normPage.indexOf(firstWord);
    }
  }

  if (startIndex === -1) {
    return "";
  }

  let endIndex = startIndex + normRef.length + 30;

  if (endKeyword) {
    const endKwStr = String(endKeyword);
    const idx = normPage.indexOf(endKwStr, startIndex);
    if (idx !== -1 && idx - startIndex < normRef.length * 2.0) {
      endIndex = idx + endKwStr.length;
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
