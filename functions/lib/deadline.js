function extractDeadline(text) {
  const source = String(text || "");
  const weekday = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\\s+";
  const patterns = [
    new RegExp(`(?:registration|application|submission)?\\s*deadline\\s*[:\\-–]?\\s*(?:${weekday})?(\\d{1,2}\\s+[A-Za-z]{3,9}\\s+20\\d{2})`, "i"),
    new RegExp(`(?:registration|application|submission)?\\s*deadline\\s*[:\\-–]?\\s*(?:${weekday})?([A-Za-z]{3,9}\\s+\\d{1,2},?\\s+20\\d{2})`, "i"),
    new RegExp(`(?:register|apply|submit)\\s+(?:by|before)\\s+(?:${weekday})?([A-Za-z]{3,9}\\s+\\d{1,2},?\\s+20\\d{2})`, "i"),
    /(?:registration|application|submission)?\s*deadline\s*[:\-–]?\s*(20\d{2}-\d{2}-\d{2})/i,
    new RegExp(`registration\\s+closes?\\s+(?:${weekday})?([A-Za-z]{3,9}\\s+\\d{1,2},?\\s+20\\d{2}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s+GMT)?)`, "i"),
    new RegExp(`registration\\s+closes?\\s+(${weekday}\\d{1,2}\\s+[A-Za-z]{3,9}\\s+20\\d{2}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s+GMT)?)`, "i")
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      const date = new Date(match[1]);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

module.exports = { extractDeadline };
