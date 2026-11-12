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
    if (!match) continue;

    const value = match[1].trim();
    let date;

    // Date-only values are interpreted as midnight UTC.
    const isoDate = value.match(/^(20\d{2})-(\d{2})-(\d{2})$/);

    if (isoDate) {
      date = new Date(Date.UTC(
        Number(isoDate[1]),
        Number(isoDate[2]) - 1,
        Number(isoDate[3])
      ));
    } else if (!/\bGMT\b/i.test(value)) {
      // Month-name dates are also interpreted as midnight UTC.
      const normalized = value.replace(
        /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})$/,
        "$2 $1, $3"
      );

      const parsed = new Date(`${normalized} UTC`);
      date = parsed;
    } else {
      // Preserve explicitly supplied GMT times.
      date = new Date(value);
    }

    if (date && !Number.isNaN(date.getTime())) return date;
  }

  return null;
}

module.exports = { extractDeadline };
