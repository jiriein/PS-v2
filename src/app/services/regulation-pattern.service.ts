import { Injectable } from '@angular/core';

interface RegulationMatch {
  text: string;
  start: number;
  end: number;
  standardized?: string;
}

@Injectable({
  providedIn: 'root',
})
export class RegulationPatternService {
  // Find all regulation patterns in the input text
  findMatches(text: string): RegulationMatch[] {
    const matches: RegulationMatch[] = [];
    const regex = /(?:n\.?\s*v\.?|n\.?\s*v(?:lády|lady)|nařízení\s*v(?:lády|lady)|narizeni\s*v(?:lady|lady)|n\.?\s*vlady|n\.?\s*vlády|nařízenívlády|narizenivlady)\s*(?:číslo|cislo|čislo|císlo|č\.?|c\.?)\s*(\d{2,4}\/\d{2,4})\s*(?:sb\.?|SB\.?)?\b/gi;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        standardized: this.standardizeMatch(match[0]),
      });
    }

    return matches;
  }

  // Standardize the matched text to a consistent format
  private standardizeMatch(match: string): string {
    const numberPart = match.match(/\d{2,4}\/\d{2,4}/)?.[0] || '';
    return `n.v. c. ${numberPart} sb.`;
  }
}