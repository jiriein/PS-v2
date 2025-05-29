import { Component, OnInit } from '@angular/core';
import { RegulationPatternService } from '../services/regulation-pattern.service';
import { ZakonyApiService } from '../services/zakony-api.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-find',
  templateUrl: './find.page.html',
  styleUrls: ['./find.page.scss'],
  standalone: false
})
export class FindPage implements OnInit {
  text: string = ''; // Input from the search bar
  matches: { text: string, start: number, end: number, standardized?: string }[] = [];

  constructor(
    private regulationPatternService: RegulationPatternService,
    private zakonyApiService: ZakonyApiService,
    private router: Router
  ) { }

  ngOnInit() { }

  // Called on every input change to update matches
  onInputChange() {
    this.matches = [];

    if (this.text.trim()) {
      this.matches = this.regulationPatternService.findLawNumbers(this.text);
      console.log('Found matches:', this.matches); // Debug log
      this.matches = this.matches.map(match => {
        if (match.standardized) {
          const normalizedStandardized = this.normalizeYear(match.standardized);
          return { ...match, standardized: normalizedStandardized };
        }
        return match;
      });
      console.log('Matches after normalization:', this.matches); // Debug log
    }
  }

  // Called when the Find button is clicked
  onSearch() {
    if (this.matches.length > 0) {
      this.navigateToDetail(this.matches[0]);
    }
  }

  // Navigate to document-detail page
  async navigateToDetail(match: { text: string, start: number, end: number, standardized?: string }) {
    if (!match.standardized) return;

    const parsed = this.zakonyApiService.parseStandardizedText(match.standardized);
    const { collection, document } = parsed;

    if (collection && document) {
      try {
        const observable = await this.zakonyApiService.getDocData(collection, document);
        const result = await new Promise((resolve, reject) => {
          observable.subscribe({
            next: (data) => resolve(data),
            error: (err) => reject(err),
          });
        });
        console.log('Navigating to document detail with data:', { result, standardized: match.standardized }); // Debug log
        await this.router.navigate([`/document-detail/${collection}/${document}`], {
          state: { result, standardized: match.standardized }
        });
      } catch (error) {
        console.warn(`Failed to fetch API result for "${match.standardized}":`, error);
      }
    } else {
      console.error('Invalid standardized format:', match.standardized);
    }
  }

  // Helper to normalize year based on digit count and value
  private normalizeYear(standardized: string): string {
    const slashIndex = standardized.indexOf('/');
    if (slashIndex === -1) return standardized;
    const yearPart = standardized.substring(slashIndex + 1).split(' ')[0];
    const year = parseInt(yearPart, 10);
    if (yearPart.length === 4) {
      return standardized.toLowerCase();
    } else if (yearPart.length === 2) {
      // Normalize 2-digit year to 4-digit
      const prefix = standardized.substring(0, slashIndex + 1);
      const suffix = standardized.substring(slashIndex + 1 + yearPart.length).toLowerCase();
      const newYear = year > 70 ? `19${year}` : `20${year}`;
      return `${prefix}${newYear}${suffix}`.toLowerCase();
    }
    return standardized.toLowerCase();
  }
}