export const isChapterHeading = (
  text: string
) => {
  const cleaned = text.trim();

  if (
    /^chapter\s+\d+/i.test(cleaned)
  ) {
    return true;
  }

  if (
    /^part\s+\d+/i.test(cleaned)
  ) {
    return true;
  }

  if (
    cleaned.length < 42 &&
    cleaned === cleaned.toUpperCase()
  ) {
    return true;
  }

  return false;
};
