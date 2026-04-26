const STOP_WORDS = new Set([
  'a','about','above','after','again','against','all','am','an','and','any','are',
  'as','at','be','because','been','before','being','below','between','both','but',
  'by','can','did','do','does','doing','down','during','each','few','for','from',
  'further','get','got','had','has','have','having','he','her','here','hers',
  'herself','him','himself','his','how','i','if','in','into','is','it','its',
  'itself','just','me','more','most','my','myself','no','nor','not','now','of',
  'off','on','once','only','or','other','our','ours','ourselves','out','over',
  'own','s','same','she','should','so','some','such','t','than','that','the',
  'their','theirs','them','themselves','then','there','these','they','this',
  'those','through','to','too','under','until','up','us','very','was','we',
  'were','what','when','where','which','while','who','whom','why','will','with',
  'would','you','your','yours','yourself','yourselves',
]);

function filterStopWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

// Extracts n-grams of length n from text.
// Skips n-grams whose first or last token is a stop word; interior stop words
// are allowed so phrases like "state of the art" survive intact.
function extractNgrams(text, n) {
  // Keep single-char tokens (e.g. "b" in "bar b que") — they're valid phrase
  // components even though they're filtered from standalone word counts.
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0);

  const ngrams = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n);
    if (STOP_WORDS.has(gram[0]) || STOP_WORDS.has(gram[n - 1])) continue;
    ngrams.push(gram.join(' '));
  }
  return ngrams;
}

function wordFrequency(texts) {
  const freq = {};
  for (const text of texts) {
    for (const word of filterStopWords(text)) {
      freq[word] = (freq[word] || 0) + 1;
    }
    for (const bigram of extractNgrams(text, 2)) {
      freq[bigram] = (freq[bigram] || 0) + 1;
    }
    for (const trigram of extractNgrams(text, 3)) {
      freq[trigram] = (freq[trigram] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));
}

module.exports = { filterStopWords, wordFrequency, extractNgrams };
