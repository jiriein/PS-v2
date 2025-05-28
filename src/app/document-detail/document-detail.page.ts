import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ZakonyApiService } from '../services/zakony-api.service';
import { TranslateService } from '@ngx-translate/core';
import { ToastController } from '@ionic/angular';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-document-detail',
  templateUrl: './document-detail.page.html',
  styleUrls: ['./document-detail.page.scss'],
  standalone: false
})
export class DocumentDetailPage implements OnInit {
  documentData: any = null;
  isLoading: boolean = false;
  highlightColor: string = 'gray';
  standardized: string = '';

  constructor(
    private route: ActivatedRoute,
    private zakonyApiService: ZakonyApiService,
    private translate: TranslateService,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    // Get data from router state (passed from scan.page.ts)
    const state = window.history.state;
    console.log('Raw state from router:', state); // Debug log
    if (state.result) {
      this.processApiResponse(state.result);
      this.highlightColor = state.highlightColor || 'gray';
      this.standardized = state.standardized || '';
      this.isLoading = false;
      console.log('Using state data:', { documentData: this.documentData, highlightColor: this.highlightColor, standardized: this.standardized });
    } else {
      // Fallback: Fetch data if no state (e.g., page refresh)
      const collection = this.route.snapshot.paramMap.get('collection') || 'cs';
      const document = this.route.snapshot.paramMap.get('document') || '';
      if (document) {
        this.fetchDocumentData(collection, document);
      } else {
        this.showWarningToast('DOCUMENT_DETAIL.NO_DOCUMENT');
      }
    }
  }

  private async fetchDocumentData(collection: string, document: string) {
    this.isLoading = true;
    try {
      const observable = await this.zakonyApiService.getDocData(collection, document);
      observable.subscribe({
        next: (data) => {
          console.log('Raw API response from getDocData:', data); // Debug log
          this.processApiResponse(data);
          this.isLoading = false;
          console.log('Document data fetched:', this.documentData); // Debug log
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Error fetching document data:', error);
          this.showWarningToast('DOCUMENT_DETAIL.ERROR_FETCH');
        }
      });
    } catch (error) {
      this.isLoading = false;
      console.error('Error fetching document data:', error);
      this.showWarningToast('DOCUMENT_DETAIL.ERROR_FETCH');
    }
  }

  private processApiResponse(data: any) {
    console.log('Processing API response:', data); // Debug log
    if (data) {
      const result = data.Result || data; // Fallback to data if Result is missing
      if (result) {
        this.documentData = {
          Title: result.Quote || result.Code || result.Head?.Quote || result.Head?.Code || 'Untitled Document',
          Quote: result.Quote || result.Head?.Quote || null, // Add Quote field
          EffectFrom: result.Head?.DeclareDate || result.EffectFrom || '',
          EffectTill: result.Version?.VersionTill || result.EffectTill || null,
          Body: {
            Parts: this.processFragments(result.Fragments || [])
          }
        };
        return;
      }
    }
    this.documentData = null;
    console.warn('Invalid API response:', data);
  }

  private processFragments(fragments: any[]): { Title?: string, Sections: { Title?: string, Paragraphs: { Number?: string, Text: string }[] }[] }[] {
    if (!Array.isArray(fragments)) return [];

    const parts: { Title?: string, Sections: { Title?: string, Paragraphs: { Number?: string, Text: string }[] }[] }[] = [];
    const paragraphs = fragments
      .filter(fragment => {
        const text = fragment.Text || fragment.Content || '';
        const quote = fragment.Quote || '';
        return text.trim().length > 0 || quote.trim().length > 0;
      })
      .map(fragment => ({
        Number: fragment.Number || null,
        Text: fragment.Text || fragment.Content || ''
      }));

    if (paragraphs.length > 0) {
      parts.push({
        Sections: [{
          Title: fragments[0]?.Title,
          Paragraphs: paragraphs
        }]
      });
    }

    return parts;
  }

  // Format date (handles /Date(1167606000000+0100)/ format)
  formatDate(dateString: string): string {
    if (!dateString) return '';
    const match = dateString.match(/\/Date\((\d+)([+-]\d{4})\)\//);
    if (!match) return dateString;
    const timestamp = parseInt(match[1], 10);
    return new Date(timestamp).toLocaleDateString('cs-CZ'); // Adjust locale as needed
  }

  // Helper method to strip hyperlinks from text
  private stripHyperlinks(text: string): string {
    // Remove <a> tags and keep inner text (e.g., <a href="...">Link</a> becomes Link)
    return text.replace(/<a\s+[^>]*href="[^"]*"[^>]*>(.*?)<\/a>/gi, '$1');
  }

  // Format content (display bold Quote followed by Fragments without Numbers)
  formatContent(body: any): string {
    let formatted = '';

    // Append Fragments content without Numbers
    if (!body || !body.Parts || !body.Parts.length) {
      return '';
    }

    body.Parts.forEach((part: any) => {
      if (part.Title) {
        const titleText = this.stripHyperlinks(part.Title);
        formatted += `<h2><${titleText}</h2>`;
      }
      if (part.Sections && Array.isArray(part.Sections)) {
        part.Sections.forEach((section: any) => {
          if (section.Title) {
            const sectionTitleText = this.stripHyperlinks(section.Title);
            formatted += `<h3>${sectionTitleText}</h3>`;
          }
          if (section.Paragraphs && Array.isArray(section.Paragraphs)) {
            section.Paragraphs.forEach((paragraph: any) => {
              const text = paragraph.Text || '';
              const strippedText = this.stripHyperlinks(text);
              formatted += `<p>${strippedText}</p>`;
            });
          }
        });
      }
    });

    return formatted;
  }

  // Transform standardized text to law number
  getName(standardized: string): string {
    const prefixMatch = standardized.match(/^(\w+\.\s*\w+\.\s*c\.)/i);
    const prefix = prefixMatch ? prefixMatch[0].trim() : '';
    
    // Extract the number part
    const remainder = standardized.replace(prefix, '').trim() || '';

    return `${remainder}`.trim();
  }

  async showWarningToast(messageKey: string) {
    const toast = await this.toastController.create({
      message: this.translate.instant(messageKey),
      duration: 3000,
      position: 'middle',
      cssClass: 'warning-toast',
      color: 'danger'
    });
    await toast.present();
  }
}