const TEXT_NODE_PATTERN = /<(?:[A-Za-z_][\w.-]*:)?rPh\b[^>]*>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?rPh\s*>|<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?t\s*>/g;

export function xmlText(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)));
}

export function escapeXml(value: string): string {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const validXmlCharacter = codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    if (!validXmlCharacter) throw new Error('Translation contains characters that are not allowed in XML 1.0.');
  }
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function visibleTextNodes(fragment: string): string[] {
  return [...fragment.matchAll(new RegExp(TEXT_NODE_PATTERN.source, 'g'))]
    .map(([element]) => element)
    .filter((element) => !/^<(?:[A-Za-z_][\w.-]*:)?rPh\b/.test(element));
}

export function visibleText(fragment: string): string {
  return visibleTextNodes(fragment).map((element) => {
    const match = /^<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?t\s*>$/.exec(element);
    return match ? xmlText(match[1]) : '';
  }).join('');
}

export function replaceVisibleText(fragment: string, value: string): string {
  const nodes = visibleTextNodes(fragment);
  if (!nodes.length) return fragment;

  const nonEmptyIndex = nodes.findIndex((element) => {
    const match = /^<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?t\s*>$/.exec(element);
    return match ? xmlText(match[1]).length > 0 : false;
  });
  const targetIndex = nonEmptyIndex < 0 ? 0 : nonEmptyIndex;
  let textIndex = 0;
  return fragment.replace(new RegExp(TEXT_NODE_PATTERN.source, 'g'), (element) => {
    if (/^<(?:[A-Za-z_][\w.-]*:)?rPh\b/.test(element)) return element;
    const index = textIndex++;
    const match = /^(<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>)[\s\S]*?(<\/(?:[A-Za-z_][\w.-]*:)?t\s*>)$/.exec(element);
    if (!match) return element;
    let openTag = match[1];
    const text = index === targetIndex ? escapeXml(value) : '';
    if (index === targetIndex && /^\s|\s$/.test(value)) {
      if (/\bxml:space\s*=/.test(openTag)) {
        openTag = openTag.replace(/\bxml:space\s*=\s*(["'])[^"']*\1/, 'xml:space="preserve"');
      } else {
        openTag = openTag.replace(/>$/, ' xml:space="preserve">');
      }
    }
    return openTag + text + match[2];
  });
}
