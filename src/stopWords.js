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

function wordFrequency(texts) {
  const freq = {};
  for (const text of texts) {
    for (const word of filterStopWords(text)) {
      freq[word] = (freq[word] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));
}

module.exports = { filterStopWords, wordFrequency };
