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
  private readonly fullNameRegex = /(?<=^|[)\s\t])(Nař\.?(?:,|\s)*vlády|Nař\.?(?:,|\s)*vl\.?|n\.?(?:,|\s)*[vy]\.?|n\.?(?:,|\s)*[vy](?:lády|lady)|(?:nařízení|narizeni)(?![a-zA-Z]*za)(?:,|\s|\t)*[vy](?:lády|lady)|n\.?(?:,|\s|\t)*[vy]lady|n\.?(?:,|\s|\t)*[vy]lády|(?:nařízení|narizeni)(?![a-zA-Z]*za)[vy]lády|(?:nařízení|narizeni)(?![a-zA-Z]*za)|z\.?|zak|zák|zakon|zákon|Zák\.?|v\.?|vyhl\.?|vyhl,?|vyhlaska|vyhláška|vyhlaška|vyhláska|vahlaska|vahláska|vahláška|vahlaška|y\.?|yyhl\.?|yyhl,?|yyhlaska|yyhláška|yyhlaška|yyhláska|yahlaska|yahláska|yahláška|yahlaška|NV|N\.V\.|Sdělení(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,})?)[\s\t]*(?:(?:[ČA-Z\p{L}][\w]*(?:[\s\t]*(?:a|č)[\s\t]*[ČA-Z\p{L}][\w]*)*|[\p{L}\s\t]{1,30}))?[\s\t]*(?:číslo|cislo|čislo|císlo|[\s\t]*č[\s\t]*\.?|c\.?|,,[\s\t]*č\.?)[\s\t]*(\d{1,4}\/\d{2,4})[\s\t]*(?:sb\.?|SB\.?|Sb|SB)(?=\s|$|[^\w\r\n])/giu;
  private readonly numberRegex = /\d{1,4}\/\d{2,4}/g;

  findRegulationPatterns(text: string): { text: string, start: number, end: number, standardized: string }[] {
    // Normalize newlines to ensure consistent handling
    const normalizedText = text.replace(/\r\n|\r/g, '\n');
    
    // Split the text into lines
    const lines = normalizedText.split('\n');
    const matches: { text: string, start: number, end: number, standardized: string }[] = [];
    let currentOffset = 0;

    // Process each line individually
    for (const line of lines) {
      let match: RegExpExecArray | null;
      this.fullNameRegex.lastIndex = 0; // Reset regex index for each line

      while ((match = this.fullNameRegex.exec(line)) !== null) {
        let matchedText = match[0];
        let startInLine = match.index;
        let endInLine = startInLine + matchedText.length;

        // Check for and trim unwanted phrases from the start of the matched text
        let trimmedText = matchedText;
        const unwantedPhrases = /\b(?:ve\s+znění|znění|zařízení)\s*/iu;
        const unwantedMatch = trimmedText.match(unwantedPhrases);

        if (unwantedMatch && unwantedMatch.index === 0) {
          const unwantedLength = unwantedMatch[0].length;
          trimmedText = trimmedText.substring(unwantedLength).trim();
          startInLine += unwantedLength; // Adjust start position
          endInLine = startInLine + trimmedText.length; // Recalculate end position
          // Revalidate trimmed text against the original regex
          const tempRegex = new RegExp(this.fullNameRegex.source, this.fullNameRegex.flags);
          tempRegex.lastIndex = 0;
          const revalidatedMatch = tempRegex.exec(trimmedText);
          if (!revalidatedMatch) {
            console.log(`Trimmed text "${trimmedText}" does not match the regulation pattern`);
            continue; // Skip if the trimmed text is not a valid regulation
          }
          trimmedText = revalidatedMatch[0]; // Update trimmedText to the revalidated match
          startInLine += revalidatedMatch.index; // Adjust start position based on revalidation
          endInLine = startInLine + trimmedText.length; // Recalculate end position
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

        // Log for debugging
        console.log(`Matched: "${match[0]}", Trimmed: "${trimmedText}", Start: ${start}, End: ${end}, Standardized: "${standardized}"`);
      }

      // Update the offset for the next line (add 1 for the newline character)
      currentOffset += line.length + 1;
    }

    return matches;
  }

  findLawNumbers(text: string): { text: string, start: number, end: number, standardized?: string }[] {
    const normalizedText = text.replace(/\r\n|\r/g, '\n');
    const lines = normalizedText.split('\n');
    const matches: { text: string, start: number, end: number, standardized?: string }[] = [];
    let currentOffset = 0;
    for (const line of lines) {
      let match: RegExpExecArray | null;
      this.numberRegex.lastIndex = 0;
      while ((match = this.numberRegex.exec(line)) !== null) {
        const lawText = match[0];
        const startInLine = match.index;
        const endInLine = startInLine + lawText.length;
        const start = currentOffset + startInLine;
        const end = currentOffset + endInLine;
        const standardized = this.standardizeRegulation(lawText);
        matches.push({
          text: lawText,
          start,
          end,
          standardized
        });
        // Log for debugging
        console.log(`Matched Law Number: "${lawText}", Start: ${start}, End: ${end}, Standardized: "${standardized}"`);
      }
      currentOffset += line.length + 1;
    }
    return matches;
  }

  private standardizeRegulation(text: string): string {
    let prefix = '';
    if (text.match(/^(?:Nař\.?|n\.?|nařízení|narizeni|NV|N\.V\.)/iu)) {
      prefix = 'n.v.'; // Narizeni vlady
    } else if (text.match(/^(?:Vyhl\.?|v\.?|vyhláška|vyhlaska)/iu)) {
      prefix = 'v.';  // Vyhlaska
    } else if (text.match(/^(?:Zák\.?|z\.?|zákon|zakon)/iu)) {
      prefix = 'z.';  // Zakon
    } else if (text.match(/^Sdělení(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,})?/iu)) {
      prefix = 's.';  // Sdeleni
    }

    const numberMatch = text.match(/(\d{1,4}\/\d{2,4})/);
    const number = numberMatch ? numberMatch[0] : '';

    return `${prefix} c. ${number} sb.`.toLowerCase();
  }
}