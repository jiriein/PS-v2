import { Injectable } from '@angular/core';

interface RegulationMatch {
  text: string;
  start: number;
  end: number;
  standardized?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RegulationPatternService {
  private readonly regex = /(?:Nař\.?(?:,|\s)*vlády|Nař\.?(?:,|\s)*vl\.?|n\.?(?:,|\s)*[vy]\.?|n\.?(?:,|\s)*[vy](?:lády|lady)|(?:nařízení|narizeni)(?![a-zA-Z]*za)(?:,|\s)*[vy](?:lády|lady)|n\.?(?:,|\s)*[vy]lady|n\.?(?:,|\s)*[vy]lády|(?:nařízení|narizeni)(?![a-zA-Z]*za)[vy]lády|(?:nařízení|narizeni)(?![a-zA-Z]*za)|z\.?|zak|zák|zakon|zákon|Zák\.?|v\.?|vyhl\.?|vyhl,?|vyhlaska|vyhláška|vyhlaška|vyhláska|vahlaska|vahláska|vahláška|vahlaška|y\.?|yyhl\.?|yyhl,?|yyhlaska|yyhláška|yyhlaška|yyhláska|yahlaska|yahláska|yahláška|yahlaška|Sdělení\s*MZV)[^\S\r\n]*(?:(?:[ČA-Z\p{L}][\w]*(?:[^\S\r\n]*(?:a|č)[^\S\r\n]*[ČA-Z\p{L}][\w]*)*|[\p{L}\s]{1,30}))?[^\S\r\n]*(?:číslo|cislo|čislo|císlo|[^\S\r\n]*č[^\S\r\n]*\.?|c\.?|,[^\S\r\n]*č\.?)[^\S\r\n]*(\d{1,4}\/\d{2,4})[^\S\r\n]*(?:sb\.?|SB\.?|Sb|SB)(?=\s|$|[^\w\r\n])/giu;

  findMatches(text: string): { text: string, start: number, end: number, standardized: string }[] {
    // Normalize newlines to ensure consistent handling
    const normalizedText = text.replace(/\r\n|\r/g, '\n');
    
    // Split the text into lines
    const lines = normalizedText.split('\n');
    const matches: { text: string, start: number, end: number, standardized: string }[] = [];
    let currentOffset = 0;

    // List of valid prefixes to identify the start of a regulation
    const prefixes = [
      /^(?:Nař\.?|n\.?|nařízení|narizeni)/iu,
      /^(?:Vyhl\.?|v\.?|vyhláška|vyhlaska)/iu,
      /^(?:Zák\.?|z\.?|zákon|zakon)/iu,
      /^(?:NV|N\.V\.)/iu,
      /^(?:Sdělení\s*MZV)/iu
    ];

    // Process each line individually
    for (const line of lines) {
      let match: RegExpExecArray | null;
      this.regex.lastIndex = 0; // Reset regex index for each line

      while ((match = this.regex.exec(line)) !== null) {
        let matchedText = match[0];
        let startInLine = match.index;
        let endInLine = startInLine + matchedText.length;

        // Check if the match is preceded by unwanted phrases
        const textBeforeMatch = line.substring(0, startInLine);
        const unwantedPhrases = /\b(?:ve\s+znění|znění|zařízení)\b\s*$/iu;
        if (unwantedPhrases.test(textBeforeMatch)) {
          continue; // Skip this match if preceded by "ve znění", "znění", or "zařízení"
        }

        // Check if the match starts with "ve znění" and adjust
        const veZneniPrefix = matchedText.match(/^(ve\s+znění\s+)/iu);
        if (veZneniPrefix) {
          const prefixLength = veZneniPrefix[0].length;
          matchedText = matchedText.substring(prefixLength);
          startInLine += prefixLength;
          endInLine = startInLine + matchedText.length;
        }

        // Find the first valid prefix in the matched text and trim anything before it
        let trimmedText = matchedText;
        let prefixOffset = 0;
        for (const prefixRegex of prefixes) {
          const prefixMatch = trimmedText.match(prefixRegex);
          if (prefixMatch && typeof prefixMatch.index === 'number') {
            prefixOffset = prefixMatch.index;
            if (prefixOffset > 0) {
              trimmedText = trimmedText.substring(prefixOffset); // Trim text before the prefix
              startInLine += prefixOffset; // Adjust the start position
              endInLine = startInLine + trimmedText.length; // Recalculate the end position
            }
            break;
          }
        }

        // Calculate the absolute start and end positions in the original text
        const start = currentOffset + startInLine;
        const end = currentOffset + endInLine;

        // Standardize the matched text
        const standardized = this.standardizeRegulation(trimmedText);

        matches.push({
          text: trimmedText,
          start,
          end,
          standardized
        });
      }

      // Update the offset for the next line (add 1 for the newline character)
      currentOffset += line.length + 1;
    }

    return matches;
  }

  private standardizeRegulation(text: string): string {
    // Simplified standardization logic (adjust as needed based on your existing implementation)
    let prefix = '';
    if (text.match(/^(?:Nař\.?|n\.?|nařízení|narizeni)/iu)) {
      prefix = 'n. v.';
    } else if (text.match(/^(?:Vyhl\.?|v\.?|vyhláška|vyhlaska)/iu)) {
      prefix = 'v.';
    } else if (text.match(/^(?:Zák\.?|z\.?|zákon|zakon)/iu)) {
      prefix = 'z.';
    } else if (text.match(/^NV|N\.V\./iu)) {
      prefix = 'n. v.';
    } else if (text.match(/^Sdělení\s*MZV/iu)) {
      prefix = 's. mzv.';
    }

    const numberMatch = text.match(/(\d{1,4}\/\d{2,4})/);
    const number = numberMatch ? numberMatch[0] : '';

    return `${prefix} c. ${number} sb.`.toLowerCase();
  }
}