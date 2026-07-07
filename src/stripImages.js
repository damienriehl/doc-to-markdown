/**
 * Strip binary image/audio embeds and local media references from markdown.
 * Replaces with [Image: alt] or [Image removed] placeholders.
 * Preserves external URL images and LaTeX math.
 */
export function stripImageEmbeds(md) {
  // Strip base64 data URI embeds (images, audio, etc.)
  let t = md.replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, (_, alt) =>
    alt.trim() ? `[Image: ${alt.trim()}]` : "[Image removed]"
  );
  // Strip Pandoc/converter media directory references
  t = t.replace(/!\[([^\]]*)\]\(media\/[^)]+\)/g, (_, alt) =>
    alt.trim() ? `[Image: ${alt.trim()}]` : "[Image removed]"
  );
  return t;
}
