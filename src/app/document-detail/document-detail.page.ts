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

  constructor(
    private route: ActivatedRoute,
    private zakonyApiService: ZakonyApiService,
    private translate: TranslateService,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    const collection = this.route.snapshot.paramMap.get('collection') || 'cs';
    const document = this.route.snapshot.paramMap.get('document') || '';

    if (document) {
      this.fetchDocumentData(collection, document);
    } else {
      this.showWarningToast('DOCUMENT_DETAIL.NO_DOCUMENT');
    }
  }

  private fetchDocumentData(collection: string, document: string) {
    this.isLoading = true;
    this.zakonyApiService.getDocData(collection, document).subscribe({
      next: (data) => {
        this.documentData = data.Result || data;
        this.isLoading = false;
        console.log('Document data:', this.documentData); // Debug log
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error fetching document data:', error);
        this.showWarningToast('DOCUMENT_DETAIL.ERROR_FETCH');
      }
    });
  }

  // Format date (handles /Date(1167606000000+0100)/ format)
  formatDate(dateString: string): string {
    if (!dateString) return '';
    const match = dateString.match(/\/Date\((\d+)([+-]\d{4})\)\//);
    if (!match) return dateString;
    const timestamp = parseInt(match[1], 10);
    return new Date(timestamp).toLocaleDateString('cs-CZ'); // Adjust locale as needed
  }

  // Format content (handles Body with Parts, Sections, Paragraphs)
  formatContent(body: any): string {
    if (!body || !body.Parts) return this.translate.instant('DOCUMENT_DETAIL.NO_CONTENT');
    
    let formatted = '';
    body.Parts.forEach((part: any) => {
      if (part.Title) {
        formatted += `<h2>${part.Title}</h2>`;
      }
      if (part.Sections && Array.isArray(part.Sections)) {
        part.Sections.forEach((section: any) => {
          if (section.Title) {
            formatted += `<h3>${section.Title}</h3>`;
          }
          if (section.Paragraphs && Array.isArray(section.Paragraphs)) {
            section.Paragraphs.forEach((paragraph: any) => {
              formatted += `<p><strong>§ ${paragraph.Number}</strong> ${paragraph.Text}</p>`;
            });
          }
        });
      }
    });
    return formatted;
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