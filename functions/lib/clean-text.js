function cleanText(value, max = 1200) {
  if (value === null || value === undefined) return "";

  if (typeof value === "object") {
    if (Array.isArray(value)) return "";
    const fields = ["name", "title", "label", "value", "text", "display_name", "full_name"];
    value = fields.map(key => value[key]).find(
      item => item !== undefined && item !== null && item !== ""
    );
    if (value === undefined || value === null || typeof value === "object") return "";
  }

  if (typeof value !== "string" && typeof value !== "number") return "";

  return String(value).replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim().slice(0, max);
}

module.exports = { cleanText };
