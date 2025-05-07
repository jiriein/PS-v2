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
    const regex = /(?:Nař\.?\s*vlády|Nař\.?\s*vl\.?|n\.?\s*[vy]\.?|n\.?\s*[vy](?:lády|lady)|nařízení\s*[vy](?:lády|lady)|narizeni\s*[vy](?:lady|lady)|n\.?\s*[vy]lady|n\.?\s*[vy]lády|nařízení[vy]lády|narizeni[vy]lady|z\.?|zak|zák|zakon|zákon|Zák\.?|v\.?|vyhl\.?|vyhlaska|vyhláška|vyhlaška|vyhláska|vahlaska|vahláska|vahláška|vahlaška|y\.?|yyhl\.?|yyhlaska|yyhláška|yyhlaška|yyhláska|yahlaska|yahláska|yahláška|yahlaška)\s*(?:(?:[ČA-Z][\w]*(?:\s*(?:a|č)\s*[ČA-Z][\w]*)*)\s*)?(?:číslo|cislo|čislo|císlo|č\.?|c\.?|,\s*č\.?)\s*(\d{2,4}\/\d{2,4})\s*(?:sb\.?|SB\.?|Sb|SB)?\b/gi;
    
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      // Determine the prefix for standardization
      let prefix = 'n.v.'; // Narizeni vlady
      if (match[0].match(/^(z\.?|zak|zák|zakon|zákon|Zák\.?)/i)) {
        prefix = 'z.'; // Zakon
      } else if (match[0].match(/^(v\.?|vyhl\.?|vyhlaska|vyhláška|vyhlaška|vyhláska|vahlaska|vahláska|vahláška|vahlaška|y\.?|yyhl\.?|yyhlaska|yyhláška|yyhlaška|yyhláska|yahlaska|yahláska|yahláška|yahlaška)/i)) {
        prefix = 'v.'; // Vyhlaska
      }

      matches.push({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        standardized: this.standardizeMatch(match[0], prefix),
      });
    }

    return matches;
  }

  private standardizeMatch(match: string, prefix: string): string {
    const numberPart = match.match(/\d{2,4}\/\d{2,4}/)?.[0] || '';
    return `${prefix} c. ${numberPart} sb.`;
  }
}